from django.urls import path

from .views import (
    BillingSummaryView,
    CreateYookassaPaymentView,
    UsageView,
    YookassaWebhookView,
)


urlpatterns = [
    path("summary/", BillingSummaryView.as_view(), name="billing-summary"),
    path("usage/", UsageView.as_view(), name="billing-usage"),
    path("yookassa/pay/", CreateYookassaPaymentView.as_view(), name="yookassa-pay"),
    path(
        "yookassa/webhook/",
        YookassaWebhookView.as_view(),
        name="yookassa-webhook",
    ),
]
