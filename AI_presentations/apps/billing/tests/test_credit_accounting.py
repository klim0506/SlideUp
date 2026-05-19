from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.billing.models import GuestSlideCredit, SlideCredit, Subscription, YookassaPayment
from apps.billing.utils import (
    check_slide_balance,
    get_effective_plan,
    spend_slides,
    transfer_guest_credits_to_user,
)
from apps.billing.yookassa_service import process_succeeded_payment


class CreditAccountingTests(TestCase):
    def create_user(self, email="u@example.com"):
        return get_user_model().objects.create_user(email=email, password="password12345")

    def test_guest_session_has_strict_seven_slide_limit(self):
        session_key = "guest-session"
        ok = spend_slides(session_key=session_key, slides_count=7)
        self.assertTrue(ok["allowed"])
        blocked = check_slide_balance(session_key=session_key, slides_count=1)
        self.assertFalse(blocked["allowed"])
        self.assertEqual(blocked["available"], 0)
        self.assertEqual(blocked["requested"], 1)
        self.assertEqual(blocked["missing"], 1)

    def test_insufficient_user_credits_do_not_partially_spend(self):
        user = self.create_user()
        SlideCredit.objects.create(user=user, monthly_limit=30, used_this_month=27)
        blocked = check_slide_balance(user=user, slides_count=4)
        self.assertFalse(blocked["allowed"])
        self.assertEqual(blocked["available"], 3)
        self.assertEqual(blocked["requested"], 4)
        self.assertEqual(SlideCredit.objects.get(user=user).used_this_month, 27)

    def test_extra_slides_are_consumed_and_survive_monthly_reset(self):
        user = self.create_user()
        credit = SlideCredit.objects.create(user=user, monthly_limit=30, used_this_month=28, extra_slides=5)
        spend_slides(user=user, slides_count=6)
        credit.refresh_from_db()
        self.assertEqual(credit.used_this_month, 30)
        self.assertEqual(credit.extra_slides, 1)

        credit.used_this_month = 0
        credit.period_start = timezone.now()
        credit.save(update_fields=("used_this_month", "period_start"))
        self.assertEqual(credit.available(), 31)

    def test_guest_usage_transfers_to_user_on_auth(self):
        user = self.create_user()
        GuestSlideCredit.objects.create(session_key="s1", monthly_limit=7, used_this_month=4)
        transferred = transfer_guest_credits_to_user(user, "s1")
        self.assertEqual(transferred, 4)
        self.assertEqual(SlideCredit.objects.get(user=user).used_this_month, 4)
        self.assertFalse(GuestSlideCredit.objects.filter(session_key="s1").exists())

    def test_expired_paid_subscription_effective_plan_is_free(self):
        user = self.create_user()
        Subscription.objects.create(
            user=user,
            plan=Subscription.Plan.PRO,
            current_period_end=timezone.now() - timedelta(days=1),
        )
        self.assertEqual(get_effective_plan(user), Subscription.Plan.FREE.value)

    def test_failed_generation_does_not_spend_credits(self):
        user = self.create_user()
        SlideCredit.objects.create(user=user, monthly_limit=30)
        client = APIClient()
        client.force_authenticate(user=user)
        with patch("apps.generation.views._call_claude_with_json_retry", side_effect=ValueError("bad")):
            response = client.post("/api/generate/", {"prompt": "test", "slides_count": 5}, format="json")
        self.assertEqual(response.status_code, 422)
        self.assertEqual(SlideCredit.objects.get(user=user).used_this_month, 0)

    def test_yookassa_slide_pack_is_idempotent_and_persistent(self):
        user = self.create_user()
        payment = {
            "id": "pay_1",
            "status": "succeeded",
            "amount": {"value": "99.00"},
            "metadata": {
                "user_id": str(user.id),
                "action": YookassaPayment.Action.SLIDE_PACK,
                "pack_id": "pack_50",
            },
        }
        self.assertTrue(process_succeeded_payment("pay_1", payment))
        self.assertFalse(process_succeeded_payment("pay_1", payment))
        credit = SlideCredit.objects.get(user=user)
        self.assertEqual(credit.extra_slides, 50)
        self.assertEqual(user.slide_packs.count(), 1)
        self.assertIsNone(user.slide_packs.first().expires_at)
