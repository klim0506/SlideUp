from datetime import datetime, time

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.models import SlideCredit


class Command(BaseCommand):
    help = "Reset monthly slide credits. Run via cron on the 1st of each month."

    def handle(self, *args, **options):
        today = timezone.localdate()
        period_start = timezone.make_aware(datetime.combine(today, time.min))
        reset_count = SlideCredit.objects.update(
            used_this_month=0,
            period_start=period_start,
        )
        self.stdout.write(f"Reset {reset_count} users")
