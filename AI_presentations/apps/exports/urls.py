from django.urls import path

from .views import ExportHTMLView, ExportPDFView, ExportPPTXView


urlpatterns = [
    path("presentations/<uuid:pk>/pptx/", ExportPPTXView.as_view(), name="export-pptx"),
    path("presentations/<uuid:pk>/pdf/", ExportPDFView.as_view(), name="export-pdf"),
    path("presentations/<uuid:pk>/html/", ExportHTMLView.as_view(), name="export-html-alt"),
]
