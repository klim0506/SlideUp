import uuid

from django.conf import settings


PLAN_PRICES = {
    "student": {
        "monthly": "490.00",
        "yearly": "4469.00",
    },
    "pro": {
        "monthly": "1390.00",
        "yearly": "12677.00",
    },
}

PACK_CONFIG = {
    "pack_50": {"slides": 50, "amount": "99.00", "days": 30},
    "pack_150": {"slides": 150, "amount": "249.00", "days": 30},
    "pack_500": {"slides": 500, "amount": "690.00", "days": 60},
}


def is_valid_plan_period(plan, billing_period="monthly"):
    """Return whether a subscription plan and billing period have a configured price."""
    return plan in PLAN_PRICES and billing_period in PLAN_PRICES[plan]


def get_plan_price(plan, billing_period="monthly"):
    """Return the configured subscription price for a plan and billing period."""
    return PLAN_PRICES[plan][billing_period]


def configure_yookassa():
    """Configure the YooKassa SDK from Django settings and return the Payment class."""
    if not settings.YOOKASSA_SHOP_ID or not settings.YOOKASSA_SECRET_KEY:
        raise ValueError("YooKassa credentials are not configured.")

    try:
        from yookassa import Configuration, Payment
    except ModuleNotFoundError as exc:
        raise ValueError("YooKassa SDK is not installed.") from exc

    Configuration.account_id = settings.YOOKASSA_SHOP_ID
    Configuration.secret_key = settings.YOOKASSA_SECRET_KEY
    return Payment


def get_yookassa_value(source, key, default=None):
    """Read a value from a YooKassa SDK object or dictionary."""
    if source is None:
        return default
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def get_confirmation_url(payment):
    """Extract the redirect confirmation URL from a YooKassa payment object."""
    confirmation = get_yookassa_value(payment, "confirmation")
    return get_yookassa_value(confirmation, "confirmation_url", "")


def get_payment_method_id(payment):
    """Extract the saved payment method identifier from a YooKassa payment object."""
    payment_method = get_yookassa_value(payment, "payment_method")
    return get_yookassa_value(payment_method, "id", "") or get_yookassa_value(
        payment,
        "payment_method_id",
        "",
    )


def get_payment_amount(payment):
    """Extract a payment amount value from a YooKassa payment object."""
    amount = get_yookassa_value(payment, "amount")
    return get_yookassa_value(amount, "value", "0.00")


def create_yookassa_payment(
    *,
    amount,
    metadata,
    description,
    save_payment_method=False,
    payment_method_id="",
):
    """Create a YooKassa payment for redirect checkout or saved-method recurring charge."""
    Payment = configure_yookassa()
    payload = {
        "amount": {
            "value": amount,
            "currency": "RUB",
        },
        "capture": True,
        "description": description,
        "metadata": metadata,
    }

    if payment_method_id:
        payload["payment_method_id"] = payment_method_id
    else:
        payload["confirmation"] = {
            "type": "redirect",
            "return_url": settings.YOOKASSA_RETURN_URL,
        }
        payload["save_payment_method"] = save_payment_method

    return Payment.create(payload, str(uuid.uuid4()))


def fetch_yookassa_payment(payment_id):
    """Fetch a YooKassa payment by its identifier."""
    Payment = configure_yookassa()
    return Payment.find_one(payment_id)
