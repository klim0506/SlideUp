"""Canonical plan limits loaded from shared/plan_limits.json (single source for backend + frontend)."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from apps.billing.models import Subscription

_JSON_PATH = Path(__file__).resolve().parent.parent.parent / "shared" / "plan_limits.json"

UNLIMITED = 10**9


@lru_cache(maxsize=1)
def _raw():
    with open(_JSON_PATH, encoding="utf-8") as f:
        return json.load(f)


def plan_limits_json():
    """Return the parsed plan_limits.json document."""
    return _raw()


def _coerce_limit(value):
    if value is None:
        return UNLIMITED
    return int(value)


def build_plan_limits():
    """Dict keyed by Subscription.Plan value for billing checks."""
    plans = _raw()["plans"]
    return {
        Subscription.Plan.FREE.value: {
            "monthly_slides": _coerce_limit(plans["free"]["monthly_slides"]),
            "pdf_exports": _coerce_limit(plans["free"]["pdf_exports_per_month"]),
        },
        Subscription.Plan.STUDENT.value: {
            "monthly_slides": _coerce_limit(plans["student"]["monthly_slides"]),
            "pdf_exports": _coerce_limit(plans["student"]["pdf_exports_per_month"]),
        },
        Subscription.Plan.PRO.value: {
            "monthly_slides": _coerce_limit(plans["pro"]["monthly_slides"]),
            "pdf_exports": _coerce_limit(plans["pro"]["pdf_exports_per_month"]),
        },
    }


PLAN_LIMITS = build_plan_limits()


def free_monthly_slides():
    """Monthly slide allowance for new Free accounts (SlideCredit, welcome copy)."""
    return int(_raw()["plans"]["free"]["monthly_slides"])


def guest_monthly_slides():
    """Monthly slide allowance for anonymous sessions."""
    return int(_raw()["plans"]["guest"]["monthly_slides"])


def max_slides_per_presentation(plan):
    """Maximum slides per generated deck for a plan id; None means unlimited."""
    raw = _raw()["plans"].get(plan, {}).get("max_slides_per_presentation")
    return None if raw is None else int(raw)
