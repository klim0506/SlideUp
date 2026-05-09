from django.conf import settings
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.utils import is_pro_plan

from .models import ColorScheme, Presentation
from .serializers import (
    ClaimPresentationSerializer,
    ColorSchemeSerializer,
    PresentationSerializer,
    PresentationThemeSerializer,
)
from .slide_html import PRESENTATION_FORMAT_HTML_V1
from .themes import normalize_theme, user_can_select_theme


def _ensure_session_key(request):
    if not request.session.session_key:
        request.session.save()
    return request.session.session_key or ""


class PresentationViewSet(viewsets.ModelViewSet):
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    serializer_class = PresentationSerializer

    def get_queryset(self):
        if self.action == "retrieve":
            return Presentation.objects.all()
        if self.request.user.is_authenticated:
            qs = Presentation.objects.filter(user=self.request.user).order_by("-created_at")
            if self.action == "list":
                # Drafts that were never sent to generation (slides=[]) are not shown
                # in the user's library; they remain accessible by direct URL until
                # the user actually generates content into them.
                qs = qs.exclude(Q(slides=[]) | Q(slides__isnull=True))
            return qs
        return Presentation.objects.none()

    def get_permissions(self):
        if self.action in {"retrieve", "create"}:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def _get_owned_presentation(self):
        return get_object_or_404(Presentation, pk=self.kwargs["pk"], user=self.request.user)

    def retrieve(self, request, *args, **kwargs):
        presentation = self.get_object()
        if presentation.is_public:
            return Response(self.get_serializer(presentation).data)

        # Владелец по аккаунту
        if request.user.is_authenticated and presentation.user_id == request.user.id:
            return Response(self.get_serializer(presentation).data)

        # Генерация без JWT: презентация с user=None и session_key сессии Django.
        # При следующем запросе с тем же session cookie доступ есть; если уже с JWT и тот же session — закрепляем за пользователем.
        session_key = request.session.session_key or ""
        if presentation.user_id is None and presentation.session_key and session_key == presentation.session_key:
            if request.user.is_authenticated:
                presentation.user = request.user
                presentation.save(update_fields=("user",))
            return Response(self.get_serializer(presentation).data)

        return Response(
            {"detail": "Not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    def destroy(self, request, *args, **kwargs):
        presentation = self._get_owned_presentation()
        presentation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def create(self, request, *args, **kwargs):
        title = (request.data.get("title") or "Новая презентация").strip() or "Новая презентация"
        theme = normalize_theme(request.data.get("theme") or "light")
        user = request.user if request.user.is_authenticated else None
        if not user_can_select_theme(user, theme):
            return Response(
                {"theme": ["Эта цветовая схема недоступна на вашем тарифе."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        presentation = Presentation.objects.create(
            user=user,
            session_key=_ensure_session_key(request),
            title=title[:255],
            theme=theme,
            presentation_format=PRESENTATION_FORMAT_HTML_V1,
            slides=[],
            slide_histories={},
        )
        return Response(self.get_serializer(presentation).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="theme")
    def update_theme(self, request, pk=None):
        presentation = self._get_owned_presentation()
        serializer = PresentationThemeSerializer(
            presentation,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(presentation).data)

    @action(detail=True, methods=["post"], url_path="share")
    def share(self, request, pk=None):
        presentation = self._get_owned_presentation()
        if not is_pro_plan(request.user):
            return Response(
                {
                    "detail": "Public sharing is available on the Pro plan.",
                    "show_upsell": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if not presentation.is_public:
            presentation.is_public = True
            presentation.save(update_fields=("is_public",))
        public_url = f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/p/{presentation.id}"
        return Response(
            {
                "id": str(presentation.id),
                "is_public": presentation.is_public,
                "public_url": public_url,
            },
            status=status.HTTP_200_OK,
        )


class ColorSchemeViewSet(viewsets.ModelViewSet):
    serializer_class = ColorSchemeSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return ColorScheme.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        if not is_pro_plan(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Создание цветовых схем доступно только на тарифе Pro.")
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        if not is_pro_plan(self.request.user):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied("Редактирование цветовых схем доступно только на тарифе Pro.")
        serializer.save()


class ClaimPresentationView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ClaimPresentationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        claimed_count = Presentation.objects.filter(
            session_key=serializer.validated_data["session_key"],
            user__isnull=True,
        ).update(user=request.user)
        return Response({"claimed": claimed_count}, status=status.HTTP_200_OK)


class PublicStatsView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        presentations = Presentation.objects.all()
        total_presentations = presentations.count()
        total_slides = sum(
            len(slides)
            for slides in presentations.values_list("slides", flat=True)
            if isinstance(slides, list)
        )
        public_presentations = presentations.filter(is_public=True).count()

        return Response(
            {
                "total_presentations": total_presentations,
                "total_slides": total_slides,
                "public_presentations": public_presentations,
            }
        )
