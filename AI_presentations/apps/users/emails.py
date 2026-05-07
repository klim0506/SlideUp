from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from apps.billing.plan_limits_config import free_monthly_slides

from .models import UserEmailEvent


def current_month_period_key() -> str:
    """Return a stable period key for events that should happen once per month."""
    return timezone.localdate().strftime("%Y-%m")


def send_user_email_once(
    *,
    user,
    event_type,
    period_key,
    subject,
    message,
) -> bool:
    """Send a user email once for a given event type and period key."""
    event, created = UserEmailEvent.objects.get_or_create(
        user=user,
        event_type=event_type,
        period_key=period_key,
    )
    if not created:
        return False

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=True,
    )
    return True


def send_welcome_email(user) -> bool:
    """Send a one-time welcome email after account registration."""
    return send_user_email_once(
        user=user,
        event_type=UserEmailEvent.EventType.WELCOME,
        period_key="account",
        subject="Добро пожаловать в Slidegen",
        message=f"Вы создали аккаунт, у вас {free_monthly_slides()} слайдов в месяц",
    )


def send_slide_limit_exhausted_email(user) -> bool:
    """Send a monthly email when a user has exhausted available slide credits."""
    upgrade_url = f"{settings.FRONTEND_PUBLIC_URL.rstrip('/')}/usage"
    return send_user_email_once(
        user=user,
        event_type=UserEmailEvent.EventType.LIMIT_EXHAUSTED,
        period_key=current_month_period_key(),
        subject="Лимит слайдов исчерпан",
        message=(
            "Лимит исчерпан — докупите или обновите план.\n\n"
            f"Докупить слайды или улучшить план: {upgrade_url}"
        ),
    )


def send_trial_reminder_email(user) -> bool:
    """Send the one-time trial reminder email to inactive registered users."""
    create_url = settings.FRONTEND_PUBLIC_URL.rstrip("/")
    return send_user_email_once(
        user=user,
        event_type=UserEmailEvent.EventType.TRIAL_REMINDER,
        period_key="registration_day_3",
        subject="Не забудьте попробовать Slidegen",
        message=f"Не забудьте попробовать: {create_url}",
    )
