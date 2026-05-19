from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.users.emails import send_slide_limit_exhausted_email

from .models import GuestSlideCredit, SlideCredit, Subscription, UsageLog
from .plan_limits_config import PLAN_LIMITS, UNLIMITED, guest_monthly_slides

GUEST_MONTHLY_SLIDES = guest_monthly_slides()


def _usage_response(
    allowed,
    reason,
    available,
    show_upsell,
    requested=0,
    recommended_action="",
):
    """Return the standard billing permission response payload."""
    requested = max(int(requested or 0), 0)
    return {
        "allowed": allowed,
        "reason": reason,
        "available": available,
        "show_upsell": show_upsell,
        "requested": requested,
        "missing": max(requested - int(available or 0), 0),
        "recommended_action": recommended_action,
    }


def _current_period_start():
    """Return the timezone-aware start of the current calendar month."""
    now = timezone.now()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_effective_plan(user):
    """Return the currently effective plan, treating expired paid plans as Free."""
    subscription = getattr(user, "subscription", None)
    if not subscription:
        return Subscription.Plan.FREE.value
    if subscription.plan == Subscription.Plan.FREE.value:
        return Subscription.Plan.FREE.value
    if subscription.current_period_end and subscription.current_period_end > timezone.now():
        return subscription.plan
    return Subscription.Plan.FREE.value


def is_pro_plan(user) -> bool:
    """Return whether a user currently has the Pro subscription plan."""
    return get_effective_plan(user) == Subscription.Plan.PRO.value


def is_student_or_pro_plan(user) -> bool:
    """Return whether a user has an active Student or Pro subscription."""
    return get_effective_plan(user) in {
        Subscription.Plan.STUDENT.value,
        Subscription.Plan.PRO.value,
    }


def _get_plan_limit(user, key):
    """Return a numeric limit for the user's plan and limit key."""
    plan = get_effective_plan(user)
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[Subscription.Plan.FREE.value])[key]


def _notify_slide_limit_exhausted(user):
    """Schedule a post-commit limit exhaustion email for a user."""
    transaction.on_commit(lambda: send_slide_limit_exhausted_email(user))


def _reset_or_sync_slide_credit(slide_credit, monthly_limit, period_start):
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
    return slide_credit


def _reset_guest_credit(guest_credit, period_start):
    if guest_credit.period_start < period_start:
        guest_credit.period_start = period_start
        guest_credit.used_this_month = 0
        guest_credit.monthly_limit = GUEST_MONTHLY_SLIDES
        guest_credit.save(
            update_fields=("period_start", "used_this_month", "monthly_limit")
        )
    elif guest_credit.monthly_limit != GUEST_MONTHLY_SLIDES:
        guest_credit.monthly_limit = GUEST_MONTHLY_SLIDES
        guest_credit.save(update_fields=("monthly_limit",))
    return guest_credit


def _insufficient_response(available, requested, reason="slide_limit_exceeded"):
    return _usage_response(
        allowed=False,
        reason=reason,
        available=available,
        show_upsell=True,
        requested=requested,
        recommended_action="reduce_slides_or_upgrade",
    )


def get_or_create_slide_credit(user, lock=False):
    period_start = _current_period_start()
    monthly_limit = _get_plan_limit(user, "monthly_slides")
    qs = SlideCredit.objects.select_for_update() if lock else SlideCredit.objects
    slide_credit, _ = qs.get_or_create(
        user=user,
        defaults={"monthly_limit": monthly_limit, "period_start": period_start},
    )
    return _reset_or_sync_slide_credit(slide_credit, monthly_limit, period_start)


def get_or_create_guest_credit(session_key, lock=False):
    period_start = _current_period_start()
    qs = GuestSlideCredit.objects.select_for_update() if lock else GuestSlideCredit.objects
    guest_credit, _ = qs.get_or_create(
        session_key=session_key,
        defaults={"monthly_limit": GUEST_MONTHLY_SLIDES, "period_start": period_start},
    )
    return _reset_guest_credit(guest_credit, period_start)


def check_slide_balance(*, user=None, session_key="", slides_count=1) -> dict:
    """Check whether a user or guest session can spend slides without deducting them."""
    slides_count = max(int(slides_count or 1), 1)
    if user is not None:
        slide_credit = get_or_create_slide_credit(user)
        available = slide_credit.available()
    else:
        guest_credit = get_or_create_guest_credit(session_key)
        available = guest_credit.available()

    if available < slides_count:
        if user is not None:
            _notify_slide_limit_exhausted(user)
        return _insufficient_response(available, slides_count)

    return {
        **_usage_response(
            allowed=True,
            reason="",
            available=max(available - slides_count, 0),
            show_upsell=False,
            requested=slides_count,
            recommended_action="",
        ),
        "spent": slides_count,
        "capped": False,
    }


def spend_slides(*, user=None, session_key="", slides_count=1) -> dict:
    """Atomically deduct slides after a generation/refinement has succeeded."""
    slides_count = max(int(slides_count or 1), 1)

    with transaction.atomic():
        if user is not None:
            slide_credit = get_or_create_slide_credit(user, lock=True)
            available = slide_credit.available()
            if available < slides_count:
                _notify_slide_limit_exhausted(user)
                return _insufficient_response(available, slides_count)

            monthly_left = max(slide_credit.monthly_limit - slide_credit.used_this_month, 0)
            monthly_spend = min(slides_count, monthly_left)
            extra_spend = slides_count - monthly_spend
            updates = {}
            if monthly_spend:
                updates["used_this_month"] = F("used_this_month") + monthly_spend
            if extra_spend:
                updates["extra_slides"] = F("extra_slides") - extra_spend
            if updates:
                SlideCredit.objects.filter(pk=slide_credit.pk).update(**updates)
            available_after_spend = max(available - slides_count, 0)
            if available_after_spend <= 0:
                _notify_slide_limit_exhausted(user)
            return {
                **_usage_response(
                    allowed=True,
                    reason="",
                    available=available_after_spend,
                    show_upsell=False,
                    requested=slides_count,
                ),
                "spent": slides_count,
                "capped": False,
            }

        guest_credit = get_or_create_guest_credit(session_key, lock=True)
        available = guest_credit.available()
        if available < slides_count:
            return _insufficient_response(available, slides_count)
        GuestSlideCredit.objects.filter(pk=guest_credit.pk).update(
            used_this_month=F("used_this_month") + slides_count
        )
        available_after_spend = max(available - slides_count, 0)
        return {
            **_usage_response(
                allowed=True,
                reason="",
                available=available_after_spend,
                show_upsell=False,
                requested=slides_count,
            ),
            "spent": slides_count,
            "capped": False,
        }


def check_and_spend_slides(user, action, slides_count=1) -> dict:
    """Check whether a user can spend slides and atomically deduct them when allowed."""
    return spend_slides(user=user, slides_count=slides_count)


def check_and_spend_slides_up_to(user, action, slides_requested) -> dict:
    """Backward-compatible strict spend: no partial generation or capped decks."""
    return spend_slides(user=user, slides_count=slides_requested)


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
            recommended_action="upgrade_subscription",
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


def transfer_guest_credits_to_user(user, session_key):
    """Move guest monthly usage into a newly authenticated user's monthly usage."""
    if not session_key:
        return 0
    period_start = _current_period_start()
    with transaction.atomic():
        guest_credit = (
            GuestSlideCredit.objects.select_for_update()
            .filter(session_key=session_key)
            .first()
        )
        if not guest_credit:
            return 0
        _reset_guest_credit(guest_credit, period_start)
        spent = int(guest_credit.used_this_month or 0)
        if spent <= 0:
            guest_credit.delete()
            return 0

        slide_credit = get_or_create_slide_credit(user, lock=True)
        monthly_left = max(slide_credit.monthly_limit - slide_credit.used_this_month, 0)
        monthly_spend = min(spent, monthly_left)
        extra_spend = max(spent - monthly_spend, 0)
        updates = {}
        if monthly_spend:
            updates["used_this_month"] = F("used_this_month") + monthly_spend
        if extra_spend:
            updates["extra_slides"] = max(int(slide_credit.extra_slides or 0) - extra_spend, 0)
        if updates:
            SlideCredit.objects.filter(pk=slide_credit.pk).update(**updates)
        guest_credit.delete()
        return spent
