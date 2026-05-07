from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.users.emails import send_slide_limit_exhausted_email

from .models import SlideCredit, Subscription, UsageLog
from .plan_limits_config import PLAN_LIMITS, UNLIMITED, free_monthly_slides


def _usage_response(allowed, reason, available, show_upsell):
    """Return the standard billing permission response payload."""
    return {
        "allowed": allowed,
        "reason": reason,
        "available": available,
        "show_upsell": show_upsell,
    }


def _current_period_start():
    """Return the timezone-aware start of the current calendar month."""
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _get_user_plan(user):
    """Return the user's subscription plan or the free plan when no subscription exists."""
    subscription = getattr(user, "subscription", None)
    if subscription:
        return subscription.plan
    return Subscription.Plan.FREE.value


def is_pro_plan(user) -> bool:
    """Return whether a user currently has the Pro subscription plan."""
    return _get_user_plan(user) == Subscription.Plan.PRO.value


def _get_plan_limit(user, key):
    """Return a numeric limit for the user's plan and limit key."""
    plan = _get_user_plan(user)
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[Subscription.Plan.FREE.value])[key]


def _notify_slide_limit_exhausted(user):
    """Schedule a post-commit limit exhaustion email for a user."""
    transaction.on_commit(lambda: send_slide_limit_exhausted_email(user))


def check_and_spend_slides(user, action, slides_count=1) -> dict:
    """Check whether a user can spend slides and atomically deduct them when allowed."""
    slides_count = max(int(slides_count or 1), 1)
    period_start = _current_period_start()

    with transaction.atomic():
        slide_credit, _ = SlideCredit.objects.select_for_update().get_or_create(
            user=user,
            defaults={"monthly_limit": free_monthly_slides(), "period_start": period_start},
        )
        monthly_limit = _get_plan_limit(user, "monthly_slides")

        if slide_credit.period_start < period_start:
            slide_credit.period_start = period_start
            slide_credit.used_this_month = 0
            slide_credit.monthly_limit = monthly_limit
            slide_credit.save(
                update_fields=("period_start", "used_this_month", "monthly_limit")
            )
        elif slide_credit.monthly_limit != monthly_limit:
            slide_credit.monthly_limit = monthly_limit
            slide_credit.save(update_fields=("monthly_limit",))

        available = slide_credit.available()
        if available < slides_count:
            _notify_slide_limit_exhausted(user)
            return _usage_response(
                allowed=False,
                reason="slide_limit_exceeded",
                available=available,
                show_upsell=True,
            )

        SlideCredit.objects.filter(pk=slide_credit.pk).update(
            used_this_month=F("used_this_month") + slides_count
        )
        available_after_spend = max(available - slides_count, 0)
        if available_after_spend <= 0:
            _notify_slide_limit_exhausted(user)
        return {
            **_usage_response(
                allowed=True,
                reason="",
                available=available_after_spend,
                show_upsell=False,
            ),
            "spent": slides_count,
            "capped": False,
        }


def check_and_spend_slides_up_to(user, action, slides_requested) -> dict:
    """Spend monthly credits up to slides_requested (capped by balance). Used for deck generation."""
    slides_requested = max(int(slides_requested or 1), 1)
    period_start = _current_period_start()

    with transaction.atomic():
        slide_credit, _ = SlideCredit.objects.select_for_update().get_or_create(
            user=user,
            defaults={"monthly_limit": free_monthly_slides(), "period_start": period_start},
        )
        monthly_limit = _get_plan_limit(user, "monthly_slides")

        if slide_credit.period_start < period_start:
            slide_credit.period_start = period_start
            slide_credit.used_this_month = 0
            slide_credit.monthly_limit = monthly_limit
            slide_credit.save(
                update_fields=("period_start", "used_this_month", "monthly_limit")
            )
        elif slide_credit.monthly_limit != monthly_limit:
            slide_credit.monthly_limit = monthly_limit
            slide_credit.save(update_fields=("monthly_limit",))

        available = slide_credit.available()
        if available < 1:
            _notify_slide_limit_exhausted(user)
            return {
                **_usage_response(
                    allowed=False,
                    reason="slide_limit_exceeded",
                    available=available,
                    show_upsell=True,
                ),
                "spent": 0,
                "capped": False,
            }

        spend = min(slides_requested, available)
        SlideCredit.objects.filter(pk=slide_credit.pk).update(
            used_this_month=F("used_this_month") + spend
        )
        available_after_spend = max(available - spend, 0)
        if available_after_spend <= 0:
            _notify_slide_limit_exhausted(user)
        return {
            **_usage_response(
                allowed=True,
                reason="",
                available=available_after_spend,
                show_upsell=False,
            ),
            "spent": spend,
            "capped": spend < slides_requested,
        }


def check_pdf_export(user) -> dict:
    """Check whether a user can export another PDF during the current calendar month."""
    pdf_limit = _get_plan_limit(user, "pdf_exports")
    period_start = _current_period_start()
    used_exports = UsageLog.objects.filter(
        user=user,
        action=UsageLog.Action.EXPORT_PDF,
        created_at__gte=period_start,
    ).count()
    available = max(pdf_limit - used_exports, 0)

    if available <= 0:
        return _usage_response(
            allowed=False,
            reason="pdf_export_limit_exceeded",
            available=available,
            show_upsell=True,
        )

    return _usage_response(
        allowed=True,
        reason="",
        available=available,
        show_upsell=False,
    )


def increment_usage(user, action, slides_spent=0, presentation=None):
    """Create a usage log entry for a user action."""
    return UsageLog.objects.create(
        user=user,
        action=action,
        slides_spent=max(int(slides_spent or 0), 0),
        presentation=presentation,
    )
