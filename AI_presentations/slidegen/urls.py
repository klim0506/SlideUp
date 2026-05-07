from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.exports.views import ExportHTMLView, ExportPDFView, ExportPPTXView
from apps.generation.views import AssistDeckView, GeneratePresentationView, RefineSlideView
from apps.presentations.views import ClaimPresentationView, ColorSchemeViewSet, PresentationViewSet, PublicStatsView
from apps.users.views import GoogleLoginView, LoginView, MeView, RefreshView, UserRegistrationView


router = DefaultRouter()
router.register("presentations", PresentationViewSet, basename="presentation")
router.register("color-schemes", ColorSchemeViewSet, basename="color-scheme")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/register/", UserRegistrationView.as_view(), name="register"),
    path("api/auth/login/", LoginView.as_view(), name="login"),
    path("api/auth/google/", GoogleLoginView.as_view(), name="google-login"),
    path("api/auth/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/generate/", GeneratePresentationView.as_view(), name="generate-presentation"),
    path("api/refine-slide/", RefineSlideView.as_view(), name="refine-slide"),
    path("api/assist-deck/", AssistDeckView.as_view(), name="assist-deck"),
    path("api/stats/", PublicStatsView.as_view(), name="public-stats"),
    path("api/export/<uuid:pk>/pptx/", ExportPPTXView.as_view(), name="export-pptx"),
    path("api/export/<uuid:pk>/pdf/", ExportPDFView.as_view(), name="export-pdf"),
    path("api/export/<uuid:pk>/html/", ExportHTMLView.as_view(), name="export-html"),
    path("api/presentations/claim/", ClaimPresentationView.as_view(), name="claim-presentation"),
    path("api/", include(router.urls)),
    path("api/generation/", include("apps.generation.urls")),
    path("api/exports/", include("apps.exports.urls")),
    path("api/billing/", include("apps.billing.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
