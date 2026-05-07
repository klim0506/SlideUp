import json
import urllib.error
import urllib.request
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum
from django.utils import timezone

from apps.billing.models import SlidePack, UsageLog, YookassaPayment
from apps.presentations.models import Presentation


class Command(BaseCommand):
    help = "Send a daily Slidegen operations report to Telegram."

    def handle(self, *args, **options):
        bot_token = settings.TELEGRAM_BOT_TOKEN
        chat_id = settings.TELEGRAM_ADMIN_CHAT_ID
        if not bot_token or not chat_id:
            raise CommandError("TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID are required.")

        User = get_user_model()
        since = timezone.now() - timedelta(days=1)

        new_users = User.objects.filter(date_joined__gte=since).count()
        active_users = (
            UsageLog.objects.filter(created_at__gte=since)
            .values("user_id")
            .distinct()
            .count()
        )
        presentations = Presentation.objects.filter(created_at__gte=since).count()
        generates = UsageLog.objects.filter(
            action=UsageLog.Action.GENERATE,
            created_at__gte=since,
        ).count()
        refines = UsageLog.objects.filter(
            action=UsageLog.Action.REFINE,
            created_at__gte=since,
        ).count()
        pdf_exports = UsageLog.objects.filter(
            action=UsageLog.Action.EXPORT_PDF,
            created_at__gte=since,
        ).count()
        paid_subscriptions = (
            YookassaPayment.objects.filter(
                action=YookassaPayment.Action.SUBSCRIBE,
                processed_at__gte=since,
            )
            .values("user_id")
            .distinct()
            .count()
        )
        slide_pack_purchases = SlidePack.objects.filter(paid_at__gte=since).count()
        revenue = (
            YookassaPayment.objects.filter(processed_at__gte=since).aggregate(
                total=Sum("amount")
            )["total"]
            or 0
        )
        pending_payments = YookassaPayment.objects.filter(processed_at__isnull=True).count()

        text = (
            "Slidegen daily report\n"
            f"Период: последние 24 часа\n"
            f"Новые пользователи: {new_users}\n"
            f"Активные пользователи: {active_users}\n"
            f"Презентации: {presentations}\n"
            f"Генерации: {generates}\n"
            f"Refine-слайды: {refines}\n"
            f"PDF-экспорты: {pdf_exports}\n"
            f"Новые платящие: {paid_subscriptions}\n"
            f"Покупки пакетов: {slide_pack_purchases}\n"
            f"Выручка: {revenue} RUB\n"
            f"YooKassa pending/unprocessed: {pending_payments}"
        )

        payload = json.dumps(
            {
                "chat_id": chat_id,
                "text": text,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{bot_token}/sendMessage",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                response.read()
        except urllib.error.URLError as exc:
            raise CommandError(f"Telegram report failed: {exc}") from exc

        self.stdout.write(self.style.SUCCESS("Telegram daily report sent"))
