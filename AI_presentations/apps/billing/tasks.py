from decimal import Decimal

try:
    from celery import shared_task
except ModuleNotFoundError:
    def shared_task(func=None, **_kwargs):
        """Return a no-op task decorator when Celery is not installed locally."""
        if func is None:
            return lambda wrapped: wrapped
        return func

from .models import Subscription, YookassaPayment
from .yookassa_client import (
    create_yookassa_payment,
    get_plan_price,
    get_payment_amount,
    get_yookassa_value,
    is_valid_plan_period,
)
from .yookassa_service import process_succeeded_payment


@shared_task
def charge_subscription(subscription_id):
    """Charge a YooKassa subscription using the saved payment method."""
    subscription = Subscription.objects.get(pk=subscription_id)
    if not subscription.yk_payment_method_id:
        return {"charged": False, "reason": "missing_payment_method"}
    billing_period = subscription.billing_period or Subscription.BillingPeriod.MONTHLY.value
    if not is_valid_plan_period(subscription.plan, billing_period):
        return {"charged": False, "reason": "unsupported_plan_or_period"}

    metadata = {
        "user_id": str(subscription.user_id),
        "action": YookassaPayment.Action.SUBSCRIBE,
        "plan": subscription.plan,
        "billing_period": billing_period,
        "subscription_id": str(subscription.id),
        "recurring": True,
    }
    payment = create_yookassa_payment(
        amount=get_plan_price(subscription.plan, billing_period),
        metadata=metadata,
        description=f"Slidegen {subscription.plan} {billing_period} subscription",
        payment_method_id=subscription.yk_payment_method_id,
    )
    payment_id = get_yookassa_value(payment, "id")
    if not payment_id:
        return {"charged": False, "reason": "missing_payment_id"}
    status = get_yookassa_value(payment, "status", "")
    YookassaPayment.objects.update_or_create(
        payment_id=payment_id,
        defaults={
            "user": subscription.user,
            "action": YookassaPayment.Action.SUBSCRIBE,
            "plan": subscription.plan,
            "billing_period": billing_period,
            "amount": Decimal(str(get_payment_amount(payment))),
            "currency": "RUB",
            "status": status,
            "metadata": metadata,
        },
    )

    if status == "succeeded":
        process_succeeded_payment(payment_id, payment)

    return {"charged": True, "payment_id": payment_id, "status": status}
