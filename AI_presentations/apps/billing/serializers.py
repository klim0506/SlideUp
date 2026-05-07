from rest_framework import serializers

from .models import SlideCredit, SlidePack, Subscription, UsageLog


class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = (
            "id",
            "plan",
            "billing_period",
            "provider",
            "ls_subscription_id",
            "yk_payment_method_id",
            "current_period_end",
        )
        read_only_fields = fields


class SlideCreditSerializer(serializers.ModelSerializer):
    available = serializers.IntegerField(read_only=True)
    is_exhausted = serializers.BooleanField(read_only=True)

    class Meta:
        model = SlideCredit
        fields = (
            "id",
            "monthly_limit",
            "extra_slides",
            "used_this_month",
            "period_start",
            "available",
            "is_exhausted",
        )
        read_only_fields = fields


class UsageLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = UsageLog
        fields = ("id", "action", "slides_spent", "presentation", "created_at")
        read_only_fields = fields


class SlidePackSerializer(serializers.ModelSerializer):
    class Meta:
        model = SlidePack
        fields = ("id", "slides", "price_rub", "expires_at", "paid_at")
        read_only_fields = fields
