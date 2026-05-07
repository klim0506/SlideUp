from django.conf import settings
from django.db import models
from django.utils import timezone


class Subscription(models.Model):
    class Plan(models.TextChoices):
        FREE = "free", "Free"
        STUDENT = "student", "Student"
        PRO = "pro", "Pro"

    class BillingPeriod(models.TextChoices):
        MONTHLY = "monthly", "Monthly"
        YEARLY = "yearly", "Yearly"

    class Provider(models.TextChoices):
        LEMONSQUEEZY = "lemonsqueezy", "Lemon Squeezy"
        YOOKASSA = "yookassa", "YooKassa"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="subscription",
    )
    plan = models.CharField(max_length=32, choices=Plan.choices, default=Plan.FREE)
    billing_period = models.CharField(
        max_length=16,
        choices=BillingPeriod.choices,
        default=BillingPeriod.MONTHLY,
    )
    provider = models.CharField(max_length=32, choices=Provider.choices, blank=True)
    ls_subscription_id = models.CharField(max_length=255, blank=True)
    yk_payment_method_id = models.CharField(max_length=255, blank=True)
    current_period_end = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.user} - {self.plan} ({self.billing_period})"


class SlideCredit(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="slide_credit",
    )
    monthly_limit = models.PositiveIntegerField(default=30)
    extra_slides = models.PositiveIntegerField(default=0)
    used_this_month = models.PositiveIntegerField(default=0)
    period_start = models.DateTimeField(default=timezone.now)

    def available(self) -> int:
        return max(self.monthly_limit + self.extra_slides - self.used_this_month, 0)

    def is_exhausted(self) -> bool:
        return self.available() <= 0

    def __str__(self) -> str:
        return f"{self.user} - {self.available()} slides available"


class UsageLog(models.Model):
    class Action(models.TextChoices):
        GENERATE = "generate", "Generate"
        REFINE = "refine", "Refine"
        EXPORT_PDF = "export_pdf", "Export PDF"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="usage_logs",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    slides_spent = models.PositiveIntegerField(default=0)
    presentation = models.ForeignKey(
        "presentations.Presentation",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="usage_logs",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user} - {self.action} x{self.slides_spent}"


class SlidePack(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="slide_packs",
    )
    slides = models.PositiveIntegerField()
    price_rub = models.PositiveIntegerField()
    expires_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.user} - {self.slides} slides"


class YookassaPayment(models.Model):
    class Action(models.TextChoices):
        SUBSCRIBE = "subscribe", "Subscribe"
        SLIDE_PACK = "slide_pack", "Slide pack"

    payment_id = models.CharField(max_length=255, unique=True)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="yookassa_payments",
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    plan = models.CharField(max_length=32, blank=True)
    billing_period = models.CharField(
        max_length=16,
        choices=Subscription.BillingPeriod.choices,
        default=Subscription.BillingPeriod.MONTHLY,
    )
    pack_id = models.CharField(max_length=32, blank=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="RUB")
    status = models.CharField(max_length=64, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.payment_id} - {self.action}"
