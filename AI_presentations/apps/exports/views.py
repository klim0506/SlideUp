from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import Subscription, UsageLog
from apps.billing.utils import check_pdf_export, increment_usage
from apps.presentations.models import Presentation

from .pdf_generator import generate_html, generate_pdf
from .pptx_generator import generate_pptx


def _presentation_data(presentation):
    """Return a dictionary payload suitable for export generators."""
    return {
        "id": str(presentation.id),
        "title": presentation.title,
        "theme": presentation.theme,
        "theme_custom": presentation.theme_custom,
        "slides": presentation.slides,
        "assets": presentation.assets,
    }


def _is_free_plan(user):
    """Return whether a user's subscription should be treated as the free plan."""
    subscription = getattr(user, "subscription", None)
    return not subscription or subscription.plan == Subscription.Plan.FREE


def _attachment_response(content, filename, content_type):
    """Build a file attachment HTTP response."""
    response = HttpResponse(content, content_type=content_type)
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


class ExportPPTXView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        """Generate and return a PPTX attachment for an owned presentation."""
        presentation = get_object_or_404(Presentation, pk=pk, user=request.user)
        content = generate_pptx(
            _presentation_data(presentation),
            watermark=_is_free_plan(request.user),
        )
        return _attachment_response(
            content,
            f"{presentation.id}.pptx",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        )


class ExportHTMLView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        """Return a downloadable HTML snapshot of an owned presentation."""
        presentation = get_object_or_404(Presentation, pk=pk, user=request.user)
        html = generate_html(
            _presentation_data(presentation),
            watermark=_is_free_plan(request.user),
        )
        raw_title = (presentation.title or "").strip() or str(presentation.id)
        safe = "".join(ch if ch not in '/\\?%*:|"<>#' else "_" for ch in raw_title)[:180] or str(presentation.id)
        return _attachment_response(
            html.encode("utf-8"),
            f"{safe}.html",
            "text/html; charset=utf-8",
        )


class ExportPDFView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        """Generate and return a PDF attachment when the user's plan allows it."""
        presentation = get_object_or_404(Presentation, pk=pk, user=request.user)
        usage_check = check_pdf_export(request.user)
        if not usage_check["allowed"]:
            return Response(
                {
                    **usage_check,
                    "upsell_message": "Upgrade your plan to export more PDFs.",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        content = generate_pdf(
            _presentation_data(presentation),
            watermark=_is_free_plan(request.user),
        )
        increment_usage(
            request.user,
            action=UsageLog.Action.EXPORT_PDF,
            slides_spent=0,
            presentation=presentation,
        )
        return _attachment_response(content, f"{presentation.id}.pdf", "application/pdf")
