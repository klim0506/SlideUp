from datetime import timedelta

from django.utils.decorators import method_decorator
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SlideCredit, Subscription, UsageLog, YookassaPayment
from .serializers import (
    SlideCreditSerializer,
    SlidePackSerializer,
    SubscriptionSerializer,
    UsageLogSerializer,
)
from .utils import PLAN_LIMITS, UNLIMITED
from .yookassa_client import (
    PACK_CONFIG,
    create_yookassa_payment,
    fetch_yookassa_payment,
    get_confirmation_url,
    get_plan_price,
    get_payment_amount,
    get_yookassa_value,
    is_valid_plan_period,
)
from .yookassa_service import process_succeeded_payment


class BillingSummaryView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        slide_credit = getattr(request.user, "slide_credit", None)
        subscription = getattr(request.user, "subscription", None)
        slide_packs = request.user.slide_packs.all()[:20]
        usage_logs = request.user.usage_logs.all()[:20]
        return Response(
            {
                "subscription": SubscriptionSerializer(subscription).data
                if subscription
                else None,
                "slide_credit": SlideCreditSerializer(slide_credit).data
                if slide_credit
                else None,
                "slide_packs": SlidePackSerializer(slide_packs, many=True).data,
                "recent_usage": UsageLogSerializer(usage_logs, many=True).data,
            }
        )


class UsageView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        period_start = today.replace(day=1)
        next_month = (period_start.replace(day=28) + timedelta(days=4)).replace(day=1)
        period_end = next_month - timedelta(days=1)

        subscription = getattr(request.user, "subscription", None)
        plan = subscription.plan if subscription else Subscription.Plan.FREE.value
        billing_period = (
            subscription.billing_period
            if subscription
            else Subscription.BillingPeriod.MONTHLY.value
        )
        plan_limits = PLAN_LIMITS.get(plan, PLAN_LIMITS[Subscription.Plan.FREE.value])
        slide_credit, _ = SlideCredit.objects.get_or_create(
            user=request.user,
            defaults={
                "monthly_limit": plan_limits["monthly_slides"],
            },
        )
        slides_limit = (
            None
            if plan_limits["monthly_slides"] >= UNLIMITED
            else plan_limits["monthly_slides"]
        )
        pdf_exports_limit = (
            None
            if plan_limits["pdf_exports"] >= UNLIMITED
            else plan_limits["pdf_exports"]
        )
        pdf_exports_used = UsageLog.objects.filter(
            user=request.user,
            action=UsageLog.Action.EXPORT_PDF,
            created_at__date__gte=period_start,
            created_at__date__lte=period_end,
        ).count()
        slides_used = (
            slide_credit.used_this_month
            if slide_credit.period_start.date() >= period_start
            else 0
        )

        usage_logs = (
            UsageLog.objects.filter(user=request.user)
            .select_related("presentation")
            .order_by("-created_at")[:30]
        )
        log = [
            {
                "date": entry.created_at.date(),
                "action_display": entry.get_action_display(),
                "slides_spent": entry.slides_spent,
                "presentation_title": entry.presentation.title
                if entry.presentation
                else None,
            }
            for entry in usage_logs
        ]

        return Response(
            {
                "plan": plan,
                "billing_period": billing_period,
                "current_period_end": subscription.current_period_end if subscription else None,
                "slides_used": slides_used,
                "slides_limit": slides_limit,
                "pdf_exports_used": pdf_exports_used,
                "pdf_exports_limit": pdf_exports_limit,
                "period_start": period_start,
                "period_end": period_end,
                "log": log,
            }
        )


class CreateYookassaPaymentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        plan = request.data.get("plan")
        pack_id = request.data.get("pack")
        billing_period = request.data.get(
            "billing_period",
            Subscription.BillingPeriod.MONTHLY.value,
        )

        if bool(plan) == bool(pack_id):
            return Response(
                {"detail": "Provide either plan or pack."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if plan:
            if not is_valid_plan_period(plan, billing_period):
                return Response(
                    {"detail": "Invalid subscription plan or billing period."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            action = YookassaPayment.Action.SUBSCRIBE
            amount = get_plan_price(plan, billing_period)
            metadata = {
                "user_id": str(request.user.id),
                "action": action,
                "plan": plan,
                "billing_period": billing_period,
            }
            description = f"Slidegen {plan} {billing_period} subscription"
            save_payment_method = True
            record_defaults = {
                "action": action,
                "plan": plan,
                "billing_period": billing_period,
                "pack_id": "",
            }
        else:
            if pack_id not in PACK_CONFIG:
                return Response(
                    {"detail": "Invalid slide pack."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            action = YookassaPayment.Action.SLIDE_PACK
            amount = PACK_CONFIG[pack_id]["amount"]
            metadata = {
                "user_id": str(request.user.id),
                "action": action,
                "pack_id": pack_id,
            }
            description = f"Slidegen slide pack {pack_id}"
            save_payment_method = False
            record_defaults = {
                "action": action,
                "plan": "",
                "billing_period": Subscription.BillingPeriod.MONTHLY.value,
                "pack_id": pack_id,
            }

        try:
            payment = create_yookassa_payment(
                amount=amount,
                metadata=metadata,
                description=description,
                save_payment_method=save_payment_method,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        payment_id = get_yookassa_value(payment, "id")
        confirmation_url = get_confirmation_url(payment)
        if not payment_id or not confirmation_url:
            return Response(
                {"detail": "YooKassa did not return a usable payment confirmation."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        YookassaPayment.objects.update_or_create(
            payment_id=payment_id,
            defaults={
                "user": request.user,
                **record_defaults,
                "amount": get_payment_amount(payment),
                "currency": "RUB",
                "status": get_yookassa_value(payment, "status", ""),
                "metadata": metadata,
            },
        )
        return Response({"confirmation_url": confirmation_url})


@method_decorator(csrf_exempt, name="dispatch")
class YookassaWebhookView(APIView):
    authentication_classes = []
    permission_classes = []

    def post(self, request):
        event = request.data.get("event")
        if event != "payment.succeeded":
            return Response(status=status.HTTP_200_OK)

        payment_id = get_yookassa_value(request.data.get("object"), "id")
        if not payment_id:
            return Response(
                {"detail": "Payment id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payment = fetch_yookassa_payment(payment_id)
            process_succeeded_payment(payment_id, payment)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(status=status.HTTP_200_OK)
