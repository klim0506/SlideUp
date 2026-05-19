"""Идентификаторы тем презентаций, проверка по тарифу и цвета для экспорта PDF/PPTX."""

from __future__ import annotations

import re
from typing import Any

from apps.billing.models import Subscription
from apps.billing.utils import get_effective_plan, is_pro_plan

_HEX_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")

CUSTOM_THEME_ID = "custom"

PRESET_MIN_PLAN: dict[str, str] = {
    "light": Subscription.Plan.FREE.value,
    "dark": Subscription.Plan.FREE.value,
    "bright_light": Subscription.Plan.STUDENT.value,
    "light_warm": Subscription.Plan.STUDENT.value,
    "dawn": Subscription.Plan.STUDENT.value,
}

LEGACY_THEME_MAP: dict[str, str] = {
    "corporate": "light",
    "minimal": "light",
    "vibrant": "bright_light",
    "bright_dark": "light_warm",
}

KNOWN_PRESET_IDS = frozenset(PRESET_MIN_PLAN.keys())
ALL_KNOWN_THEME_IDS = frozenset({*KNOWN_PRESET_IDS, CUSTOM_THEME_ID})

# Hex без «#» — как ожидают шаблоны экспорта и python-pptx.
EXPORT_PALETTES: dict[str, dict[str, str]] = {
    "light": {"bg": "F7FBFF", "text": "0B1F3A", "accent": "2563EB"},
    "dark": {"bg": "0F2F5F", "text": "F7FBFF", "accent": "7DD3FC"},
    "bright_light": {"bg": "FFFFFF", "text": "0F172A", "accent": "0284C7"},
    "light_warm": {"bg": "FAF9F6", "text": "1C1917", "accent": "B45309"},
    "dawn": {"bg": "FAF5FF", "text": "4C1D95", "accent": "A855F7"},
}


def normalize_theme(theme: str | None) -> str:
    raw = (theme or "light").strip()
    if not raw:
        raw = "light"
    return LEGACY_THEME_MAP.get(raw, raw)


def _user_plan(user) -> str:
    if not user or not user.is_authenticated:
        return Subscription.Plan.FREE.value
    return get_effective_plan(user)


def _plan_rank(plan: str) -> int:
    if plan == Subscription.Plan.PRO.value:
        return 2
    if plan == Subscription.Plan.STUDENT.value:
        return 1
    return 0


def preset_required_plan(theme_id: str) -> str:
    tid = normalize_theme(theme_id)
    return PRESET_MIN_PLAN.get(tid, Subscription.Plan.STUDENT.value)


def user_can_select_theme(user, theme_id: str) -> bool:
    tid = normalize_theme(theme_id)
    if tid == CUSTOM_THEME_ID:
        return bool(user and user.is_authenticated and is_pro_plan(user))
    if tid not in KNOWN_PRESET_IDS:
        return False
    need = preset_required_plan(tid)
    return _plan_rank(_user_plan(user)) >= _plan_rank(need)


def sanitize_generation_theme(user, theme: str | None) -> str:
    """Тема при создании презентации: только пресеты, без custom; гость и Free — только light/dark."""
    tid = normalize_theme(theme)
    if tid == CUSTOM_THEME_ID:
        return "light"
    if tid not in KNOWN_PRESET_IDS:
        return "light"
    if user_can_select_theme(user, tid):
        return tid
    return "light"


def validate_theme_custom_payload(raw: Any) -> dict[str, str] | None:
    if raw is None:
        return None
    if raw in ("", {}):
        return None
    if not isinstance(raw, dict):
        raise ValueError("theme_custom должен быть объектом с полями bg, ink, accent.")

    out: dict[str, str] = {}
    for key in ("bg", "ink", "accent"):
        if key not in raw:
            continue
        val = raw[key]
        if not isinstance(val, str) or not _HEX_RE.match(val.strip()):
            raise ValueError(f"Некорректный цвет {key}: нужен формат #RRGGBB.")
        out[key] = val.strip().lower()
    return out or None


def _strip_hash(val: Any) -> str:
    if not isinstance(val, str):
        return ""
    s = val.strip().lstrip("#")
    if len(s) == 6 and re.fullmatch(r"[0-9A-Fa-f]{6}", s):
        return s.upper()
    return ""


def resolve_export_theme(presentation_data: dict) -> dict[str, str]:
    """Вернуть словарь bg / text / accent (hex без #) для PDF и PPTX."""
    tid = normalize_theme(presentation_data.get("theme"))
    if tid == CUSTOM_THEME_ID:
        custom = presentation_data.get("theme_custom") or {}
        bg = _strip_hash(custom.get("bg")) or "F7FBFF"
        text = _strip_hash(custom.get("ink")) or "0B1F3A"
        accent = _strip_hash(custom.get("accent")) or "2563EB"
        return {"bg": bg, "text": text, "accent": accent}
    base = EXPORT_PALETTES.get(tid) or EXPORT_PALETTES["light"]
    return {k: v.upper() for k, v in base.items()}
