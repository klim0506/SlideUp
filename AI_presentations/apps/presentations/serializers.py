import re

from rest_framework import serializers

from apps.billing.utils import is_pro_plan

from .models import ColorScheme, Presentation
from .themes import (
    CUSTOM_THEME_ID,
    normalize_theme,
    user_can_select_theme,
    validate_theme_custom_payload,
)


def coerce_presentation_theme(user, theme: str | None, theme_custom):
    """Проверить тему и theme_custom по тарифу; вернуть канонические значения для сохранения."""
    tnorm = normalize_theme(theme or "light")
    if not user_can_select_theme(user, tnorm):
        raise serializers.ValidationError(
            {"theme": "Эта цветовая схема недоступна на вашем тарифе."},
        )
    try:
        parsed_tc = validate_theme_custom_payload(theme_custom)
    except ValueError as exc:
        raise serializers.ValidationError({"theme_custom": str(exc)}) from exc

    if tnorm == CUSTOM_THEME_ID:
        if not parsed_tc:
            raise serializers.ValidationError(
                {
                    "theme_custom": "Задайте хотя бы один цвет (#RRGGBB): фон, текст или акцент.",
                },
            )
        return CUSTOM_THEME_ID, parsed_tc

    if parsed_tc:
        raise serializers.ValidationError(
            {
                "theme_custom": "Собственная палитра доступна только с темой «Своя тема» на тарифе Pro.",
            },
        )
    return tnorm, None


class PresentationSerializer(serializers.ModelSerializer):
    slide_count = serializers.SerializerMethodField()
    slide_histories = serializers.JSONField(required=False)

    class Meta:
        model = Presentation
        fields = (
            "id",
            "title",
            "theme",
            "theme_custom",
            "slides",
            "slides_unlocked",
            "slide_histories",
            "assets",
            "is_public",
            "created_at",
            "slide_count",
        )
        read_only_fields = ("id", "created_at", "slide_count", "assets", "slides_unlocked")

    def validate_slide_histories(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Ожидается объект JSON (словарь).")
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if not self.instance:
            return attrs
        if "theme" not in attrs and "theme_custom" not in attrs:
            return attrs

        request = self.context.get("request")
        user = getattr(request, "user", None)

        theme = attrs.get("theme", self.instance.theme)
        if "theme_custom" in attrs:
            theme_custom = attrs["theme_custom"]
        else:
            theme_custom = (
                self.instance.theme_custom if normalize_theme(theme) == CUSTOM_THEME_ID else None
            )

        new_theme, new_tc = coerce_presentation_theme(user, theme, theme_custom)
        attrs["theme"] = new_theme
        attrs["theme_custom"] = new_tc
        return attrs

    def get_slide_count(self, obj):
        """Return the number of slides stored in the presentation JSON payload."""
        return len(obj.slides) if isinstance(obj.slides, list) else 0

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("slide_histories") is None:
            data["slide_histories"] = {}
        return data

    def validate_is_public(self, value):
        """Allow enabling public access only for Pro users."""
        if not value:
            return value
        if self.instance and self.instance.is_public:
            return value

        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated or not is_pro_plan(user):
            raise serializers.ValidationError("Public sharing is available on the Pro plan.")
        return value


class PresentationThemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Presentation
        fields = ("theme", "theme_custom")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        inst = self.instance

        theme = attrs.get("theme", inst.theme)
        if "theme_custom" in attrs:
            theme_custom = attrs["theme_custom"]
        else:
            theme_custom = inst.theme_custom if normalize_theme(theme) == CUSTOM_THEME_ID else None

        new_theme, new_tc = coerce_presentation_theme(user, theme, theme_custom)
        attrs["theme"] = new_theme
        attrs["theme_custom"] = new_tc
        return attrs


class ClaimPresentationSerializer(serializers.Serializer):
    session_key = serializers.CharField(max_length=128)


_HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


def _validate_hex(value, field_name):
    if not _HEX_RE.match(value):
        raise serializers.ValidationError({field_name: "Ожидается цвет в формате #RRGGBB."})
    return value.lower()


class ColorSchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ColorScheme
        fields = ("id", "name", "bg", "ink", "accent", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_bg(self, value):
        return _validate_hex(value, "bg")

    def validate_ink(self, value):
        return _validate_hex(value, "ink")

    def validate_accent(self, value):
        return _validate_hex(value, "accent")
