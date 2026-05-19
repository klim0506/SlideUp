import calendar
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import SlideCredit, SlidePack, Subscription, YookassaPayment
from .utils import PLAN_LIMITS
from .yookassa_client import (
    PACK_CONFIG,
    get_payment_amount,
    get_payment_method_id,
    get_yookassa_value,
)


def add_calendar_months(moment, months=1):
    """Return a datetime advanced by a number of calendar months."""
    month_index = moment.month - 1 + months
    year = moment.year + month_index // 12
    month = month_index % 12 + 1
    day = min(moment.day, calendar.monthrange(year, month)[1])
    return moment.replace(year=year, month=month, day=day)


def get_payment_metadata(payment):
    """Return metadata from a YooKassa payment object as a plain dictionary."""
    metadata = get_yookassa_value(payment, "metadata", {}) or {}
    return dict(metadata)


def sync_yookassa_payment_record(payment_id, payment):
    """Create or update a local YooKassa payment record from a YooKassa payment object."""
    metadata = get_payment_metadata(payment)
    user_id = metadata.get("user_id")
    user = get_user_model().objects.get(pk=user_id)
    action = metadata.get("action", "")
    plan = metadata.get("plan", "")
    billing_period = metadata.get(
        "billing_period",
        Subscription.BillingPeriod.MONTHLY.value,
    )
    pack_id = metadata.get("pack_id", "")
    amount = Decimal(str(get_payment_amount(payment)))
    status = get_yookassa_value(payment, "status", "")

    record, _ = YookassaPayment.objects.update_or_create(
        payment_id=payment_id,
        defaults={
            "user": user,
            "action": action,
            "plan": plan,
            "billing_period": billing_period,
            "pack_id": pack_id,
            "amount": amount,
            "currency": "RUB",
            "status": status,
            "metadata": metadata,
        },
    )
    return record


def apply_subscription_payment(record, payment):
    """Apply a successful YooKassa subscription payment to the user's subscription."""
    now = timezone.now()
    plan = record.plan
    billing_period = record.billing_period or Subscription.BillingPeriod.MONTHLY.value
    period_months = 12 if billing_period == Subscription.BillingPeriod.YEARLY else 1
    payment_method_id = get_payment_method_id(payment)
    subscription, _ = Subscription.objects.get_or_create(user=record.user)
    base_period_end = (
        subscription.current_period_end
        if subscription.current_period_end and subscription.current_period_end > now
        else now
    )

    subscription.provider = Subscription.Provider.YOOKASSA
    subscription.plan = plan
    subscription.billing_period = billing_period
    if payment_method_id:
        subscription.yk_payment_method_id = payment_method_id
    subscription.current_period_end = add_calendar_months(base_period_end, period_months)
    subscription.save(
        update_fields=(
            "provider",
            "plan",
            "billing_period",
            "yk_payment_method_id",
            "current_period_end",
        )
    )

    monthly_limit = PLAN_LIMITS[plan]["monthly_slides"]
    slide_credit, _ = SlideCredit.objects.get_or_create(user=record.user)
    slide_credit.monthly_limit = monthly_limit
    slide_credit.save(update_fields=("monthly_limit",))


def apply_slide_pack_payment(record):
    """Apply a successful YooKassa slide-pack payment to the user's slide balance."""
    pack_config = PACK_CONFIG[record.pack_id]
    now = timezone.now()

    slide_credit, _ = SlideCredit.objects.get_or_create(user=record.user)
    SlideCredit.objects.filter(pk=slide_credit.pk).update(
        extra_slides=F("extra_slides") + pack_config["slides"]
    )
    SlidePack.objects.create(
        user=record.user,
        slides=pack_config["slides"],
        price_rub=int(Decimal(pack_config["amount"])),
        expires_at=None,
        paid_at=now,
    )


def process_succeeded_payment(payment_id, payment):
    """Apply a successful YooKassa payment exactly once and return whether it was processed."""
    sync_yookassa_payment_record(payment_id, payment)
    with transaction.atomic():
        record = YookassaPayment.objects.select_for_update().get(payment_id=payment_id)
        if record.processed_at:
            return False

        if record.action == YookassaPayment.Action.SUBSCRIBE:
            apply_subscription_payment(record, payment)
        elif record.action == YookassaPayment.Action.SLIDE_PACK:
            apply_slide_pack_payment(record)

        record.status = get_yookassa_value(payment, "status", "succeeded")
        record.metadata = get_payment_metadata(payment)
        record.processed_at = timezone.now()
        record.save(update_fields=("status", "metadata", "processed_at", "updated_at"))
        return True
