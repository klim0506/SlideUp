import re

from rest_framework import serializers

from apps.billing.utils import is_pro_plan

from .models import ColorScheme, Presentation
from .slide_html import (
    PRESENTATION_FORMAT_HTML_V1,
    PRESENTATION_FORMAT_JSON_V1,
    SLIDE_SID_KEY,
    coerce_html_slide,
    sanitize_slide_html,
)
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


def _sanitize_incoming_slides(value, instance):
    """Coerce slides PATCH'ed by the client into the canonical html shape.

    Accepts either the new ``[{html, metadata}, …]`` shape or the legacy
    structured shape (for back-compat with old clients still in flight); both
    are normalized to ``[{html, metadata, _sid?}, …]`` and html is sanitized.
    The legacy structured shape is also accepted when the presentation row is
    still ``json_v1`` and the client sends back the same shape — in that case
    we keep it as-is so editing existing decks does not auto-migrate them.
    """
    if value is None:
        return []
    if not isinstance(value, list):
        raise serializers.ValidationError("Slides must be a list.")

    legacy_keep = (
        instance is not None
        and getattr(instance, "presentation_format", PRESENTATION_FORMAT_JSON_V1)
        == PRESENTATION_FORMAT_JSON_V1
        and all(isinstance(s, dict) and "html" not in s for s in value)
    )
    if legacy_keep:
        return value

    out = []
    for s in value:
        coerced = coerce_html_slide(s)
        # coerce_html_slide already sanitizes; double-check by re-sanitizing
        # in case the client tried to smuggle a payload with already-set html.
        coerced["html"] = sanitize_slide_html(coerced.get("html", ""))
        if isinstance(s, dict):
            sid = s.get(SLIDE_SID_KEY)
            if isinstance(sid, str) and sid:
                coerced[SLIDE_SID_KEY] = sid
        out.append(coerced)
    return out


class PresentationSerializer(serializers.ModelSerializer):
    slide_count = serializers.SerializerMethodField()
    slide_histories = serializers.JSONField(required=False)
    slides = serializers.JSONField(required=False)

    class Meta:
        model = Presentation
        fields = (
            "id",
            "title",
            "style",
            "theme",
            "theme_custom",
            "presentation_format",
            "slides",
            "slides_unlocked",
            "slide_histories",
            "assets",
            "is_public",
            "created_at",
            "slide_count",
        )
        read_only_fields = (
            "id",
            "created_at",
            "slide_count",
            "assets",
            "style",
            "slides_unlocked",
            "presentation_format",
        )

    def validate_slide_histories(self, value):
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("Ожидается объект JSON (словарь).")
        return value

    def validate_slides(self, value):
        return _sanitize_incoming_slides(value, self.instance)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if "slides" in attrs and self.instance is not None:
            # If the client sent the new html shape into a legacy json_v1 row,
            # promote the row's format. Pure-legacy edits leave it untouched.
            if any(isinstance(s, dict) and "html" in s for s in attrs["slides"]):
                attrs["presentation_format"] = PRESENTATION_FORMAT_HTML_V1
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
        """Return the number of slides stored on the presentation."""
        return len(obj.slides) if isinstance(obj.slides, list) else 0

    def to_representation(self, instance):
        data = super().to_representation(instance)
        if data.get("slide_histories") is None:
            data["slide_histories"] = {}
        if not data.get("presentation_format"):
            data["presentation_format"] = PRESENTATION_FORMAT_JSON_V1
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
