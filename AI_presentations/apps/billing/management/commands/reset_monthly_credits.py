from datetime import datetime, time

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.billing.models import GuestSlideCredit, SlideCredit
from apps.billing.utils import GUEST_MONTHLY_SLIDES, _get_plan_limit


class Command(BaseCommand):
    help = "Reset monthly slide credits. Run via cron on the 1st of each month."

    def handle(self, *args, **options):
        today = timezone.localdate()
        period_start = timezone.make_aware(datetime.combine(today, time.min))
        reset_count = 0
        for credit in SlideCredit.objects.select_related("user").iterator():
            credit.used_this_month = 0
            credit.period_start = period_start
            credit.monthly_limit = _get_plan_limit(credit.user, "monthly_slides")
            credit.save(update_fields=("used_this_month", "period_start", "monthly_limit"))
            reset_count += 1
        guest_count = GuestSlideCredit.objects.update(
            used_this_month=0,
            period_start=period_start,
            monthly_limit=GUEST_MONTHLY_SLIDES,
        )
        self.stdout.write(f"Reset {reset_count} users and {guest_count} guest sessions")
