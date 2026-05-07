from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.billing.models import UsageLog
from apps.presentations.models import Presentation
from apps.users.emails import send_trial_reminder_email
from apps.users.models import UserEmailEvent


class Command(BaseCommand):
    help = "Send one-time trial reminder emails to users who have not generated anything."

    def handle(self, *args, **options):
        User = get_user_model()
        cutoff = timezone.now() - timedelta(days=3)
        generated_usage = UsageLog.objects.filter(
            user=OuterRef("pk"),
            action=UsageLog.Action.GENERATE,
        )
        generated_presentation = Presentation.objects.filter(user=OuterRef("pk"))
        prior_reminder = UserEmailEvent.objects.filter(
            user=OuterRef("pk"),
            event_type=UserEmailEvent.EventType.TRIAL_REMINDER,
        )

        users = (
            User.objects.filter(date_joined__lte=cutoff, is_active=True)
            .annotate(
                has_generated_usage=Exists(generated_usage),
                has_presentation=Exists(generated_presentation),
                has_trial_reminder=Exists(prior_reminder),
            )
            .filter(
                has_generated_usage=False,
                has_presentation=False,
                has_trial_reminder=False,
            )
        )

        sent_count = 0
        for user in users.iterator():
            if send_trial_reminder_email(user):
                sent_count += 1

        self.stdout.write(self.style.SUCCESS(f"Sent {sent_count} trial reminders"))
