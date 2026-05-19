from django.conf import settings
from rest_framework import generics, permissions, status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from .serializers import (
    CurrentUserSerializer,
    GoogleLoginSerializer,
    LoginSerializer,
    UserRegistrationSerializer,
)
from .services import get_or_create_google_user, verify_google_id_token
from .services import provision_user_account


class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        if not request.session.session_key:
            request.session.create()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            CurrentUserSerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class LoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not request.session.session_key:
            request.session.create()
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        provision_user_account(
            serializer.validated_data["user"],
            session_key=request.session.session_key,
            send_welcome=False,
        )
        refresh = RefreshToken.for_user(serializer.validated_data["user"])
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            }
        )


class GoogleLoginView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        if not settings.GOOGLE_CLIENT_ID:
            raise AuthenticationFailed("Google sign-in is not configured.")

        if not request.session.session_key:
            request.session.create()

        serializer = GoogleLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = verify_google_id_token(
            serializer.validated_data["credential"],
            settings.GOOGLE_CLIENT_ID,
        )
        user = get_or_create_google_user(
            profile,
            session_key=request.session.session_key,
        )
        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "access": str(refresh.access_token),
                "refresh": str(refresh),
            }
        )


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(CurrentUserSerializer(request.user).data)
