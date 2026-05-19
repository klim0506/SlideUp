from django.contrib import admin

from .models import GuestSlideCredit, SlideCredit, SlidePack, Subscription, UsageLog, YookassaPayment


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "billing_period", "provider", "current_period_end")
    list_filter = ("plan", "billing_period", "provider")
    search_fields = ("user__username", "user__email", "ls_subscription_id", "yk_payment_method_id")


@admin.register(SlideCredit)
class SlideCreditAdmin(admin.ModelAdmin):
    list_display = ("user", "monthly_limit", "extra_slides", "used_this_month", "period_start")
    search_fields = ("user__username", "user__email")


@admin.register(GuestSlideCredit)
class GuestSlideCreditAdmin(admin.ModelAdmin):
    list_display = ("session_key", "monthly_limit", "used_this_month", "period_start", "updated_at")
    search_fields = ("session_key",)


@admin.register(UsageLog)
class UsageLogAdmin(admin.ModelAdmin):
    list_display = ("user", "action", "slides_spent", "presentation", "created_at")
    list_filter = ("action", "created_at")
    search_fields = ("user__username", "user__email", "presentation__title")


@admin.register(SlidePack)
class SlidePackAdmin(admin.ModelAdmin):
    list_display = ("user", "slides", "price_rub", "paid_at", "expires_at")
    search_fields = ("user__username", "user__email")


@admin.register(YookassaPayment)
class YookassaPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "payment_id",
        "user",
        "action",
        "plan",
        "billing_period",
        "pack_id",
        "amount",
        "status",
        "processed_at",
    )
    list_filter = ("action", "billing_period", "status", "processed_at")
    search_fields = ("payment_id", "user__username", "user__email")
