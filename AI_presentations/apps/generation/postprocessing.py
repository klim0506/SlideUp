"""Parse, validate, and sanitize Claude responses into canonical HTML slides.

The pipeline accepts either the new wrapper ``{title, slides:[{html, metadata}]}``
or, for resilience, the legacy structured shape; in both cases the output is a
deck dict with html slides and a ``presentation_format`` marker.
"""

from __future__ import annotations

import json
import re
from copy import deepcopy
from typing import Any

from apps.presentations.slide_html import (
    PRESENTATION_FORMAT_HTML_V1,
    SLIDE_SID_KEY,
    coerce_html_slide,
    json_slide_to_html,
    metadata_for_legacy_slide,
    sanitize_slide_html,
    strip_to_text,
)


MAX_TITLE_LENGTH = 80
MIN_SLIDES = 1

VALID_LAYOUTS = frozenset({"title", "content", "two_column", "quote", "stats", "cta"})

# Legacy slide types that the model might still emit; postprocessing folds them
# into HTML via the converter so we never lose data even on contract drift.
VALID_SLIDE_TYPES = VALID_LAYOUTS


def parse_json(raw: str) -> dict:
    """Parse Claude output as JSON using direct parse, fence stripping, then object regex fallback."""
    if not isinstance(raw, str):
        raise ValueError("Raw response must be a string.")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    stripped = raw.strip()
    fenced_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL)
    if fenced_match:
        try:
            return json.loads(fenced_match.group(1))
        except json.JSONDecodeError:
            pass

    object_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if object_match:
        try:
            return json.loads(object_match.group(0))
        except json.JSONDecodeError as exc:
            raise ValueError("Could not parse JSON object from response.") from exc

    raise ValueError("Could not parse JSON from response.")


def _truncate(text: str, max_len: int, suffix: str = "...") -> str:
    text = str(text)
    if len(text) <= max_len:
        return text
    if max_len <= len(suffix):
        return suffix[:max_len]
    return text[: max_len - len(suffix)].rstrip() + suffix


def _sanitize_title(title: Any, fallback_index: int) -> str:
    title_text = re.sub(r"\s+", " ", str(title or "")).strip()
    if not title_text:
        title_text = f"Slide {fallback_index}"
    return _truncate(title_text, MAX_TITLE_LENGTH)


def _sanitize_chart(chart: Any) -> dict | None:
    """Validate and clean a chart object; return None if malformed."""
    if not isinstance(chart, dict):
        return None
    if chart.get("type") != "bar":
        return None
    data = chart.get("data")
    if not isinstance(data, list) or len(data) < 2:
        return None
    clean_data = []
    for point in data[:8]:
        if not isinstance(point, dict):
            continue
        label = str(point.get("label", "")).strip()[:24]
        try:
            value = float(point["value"])
        except (KeyError, TypeError, ValueError):
            continue
        if label:
            clean_data.append({"label": label, "value": value})
    if len(clean_data) < 2:
        return None
    result: dict = {"type": "bar", "data": clean_data}
    if isinstance(chart.get("title"), str) and chart["title"].strip():
        result["title"] = chart["title"].strip()
    return result


def _sanitize_metadata(metadata: Any, *, slide_index: int, default_title: str = "") -> dict:
    md: dict[str, Any] = {}
    if isinstance(metadata, dict):
        layout = metadata.get("layout")
        if isinstance(layout, str) and layout in VALID_LAYOUTS:
            md["layout"] = layout
        title = metadata.get("title")
        if isinstance(title, str) and title.strip():
            md["title"] = _sanitize_title(title, slide_index)
        icon = metadata.get("icon")
        if isinstance(icon, str) and icon.strip():
            md["icon"] = icon.strip()[:8]
        image_ref = metadata.get("image_ref")
        if isinstance(image_ref, str) and image_ref.strip():
            md["image_ref"] = image_ref.strip()[:64]
        notes = metadata.get("notes")
        if isinstance(notes, str) and notes.strip():
            md["notes"] = notes.strip()[:600]
        chart = _sanitize_chart(metadata.get("chart"))
        if chart:
            md["chart"] = chart
    if "layout" not in md:
        md["layout"] = "content"
    if "title" not in md:
        if default_title:
            md["title"] = _sanitize_title(default_title, slide_index)
        else:
            md["title"] = f"Slide {slide_index}"
    return md


def _slide_from_html_payload(item: dict, *, slide_index: int) -> dict:
    """Process one ``{html, metadata}`` item from the model into a clean slide dict."""
    raw_html = item.get("html")
    sanitized_html = sanitize_slide_html(raw_html or "")
    extracted_title = strip_to_text(sanitized_html, max_len=80) if sanitized_html else ""
    metadata = _sanitize_metadata(
        item.get("metadata"),
        slide_index=slide_index,
        default_title=extracted_title,
    )

    if not sanitized_html:
        # Fallback: build a minimal HTML body from metadata so the slot is not empty.
        layout = metadata.get("layout", "content")
        title = metadata.get("title", f"Slide {slide_index}")
        sanitized_html = sanitize_slide_html(
            f"<section class=\"slide slide-{layout}\" data-layout=\"{layout}\""
            f" data-format=\"html_v1\"><h2 class=\"slide-title\">{title}</h2></section>"
        )

    out: dict[str, Any] = {"html": sanitized_html, "metadata": metadata}
    sid = item.get(SLIDE_SID_KEY)
    if isinstance(sid, str) and sid:
        out[SLIDE_SID_KEY] = sid
    return out


def _slide_from_legacy_json(slide: dict, *, slide_index: int) -> dict:
    """Convert a legacy structured slide dict into the new {html, metadata} shape."""
    sanitized_html = json_slide_to_html(slide)
    metadata = metadata_for_legacy_slide(slide)
    metadata = _sanitize_metadata(
        {**metadata, "title": metadata.get("title")},
        slide_index=slide_index,
        default_title=str(slide.get("title") or ""),
    )

    out: dict[str, Any] = {"html": sanitized_html, "metadata": metadata}
    sid = slide.get(SLIDE_SID_KEY)
    if isinstance(sid, str) and sid:
        out[SLIDE_SID_KEY] = sid
    return out


def _enforce_image_ref_unique(slides: list[dict]) -> None:
    """At most one slide may carry image_ref; drop the flag from any extras."""
    seen = False
    for s in slides:
        md = s.get("metadata") or {}
        if md.get("image_ref"):
            if seen:
                md.pop("image_ref", None)
            else:
                seen = True


def validate_structure(data: dict, expected_slides_count: int | None = None) -> None:
    """Validate that parsed deck data looks plausible (title + non-empty slides list)."""
    if not isinstance(data, dict):
        raise ValueError("Parsed data must be a dictionary.")
    if not data.get("title"):
        raise ValueError("Presentation title is required.")
    slides = data.get("slides")
    if not isinstance(slides, list):
        raise ValueError("Slides must be a list.")
    if len(slides) < MIN_SLIDES:
        raise ValueError(f"At least {MIN_SLIDES} slides are required.")
    if expected_slides_count is not None and len(slides) != expected_slides_count:
        raise ValueError(f"Expected {expected_slides_count} slides, got {len(slides)}.")


def _looks_like_html_payload(item: Any) -> bool:
    return (
        isinstance(item, dict)
        and ("html" in item or "metadata" in item)
        and not item.get("type")  # legacy slides have a "type" key
    )


def sanitize_slides(data: dict) -> dict:
    """Return a deck dict with html slides and presentation_format set to html_v1."""
    sanitized: dict[str, Any] = deepcopy(data)
    sanitized["title"] = _sanitize_title(sanitized.get("title", ""), 0)

    raw_slides = sanitized.get("slides", []) or []
    out_slides: list[dict] = []
    for index, raw in enumerate(raw_slides, start=1):
        if _looks_like_html_payload(raw):
            out_slides.append(_slide_from_html_payload(raw, slide_index=index))
        elif isinstance(raw, dict):
            out_slides.append(_slide_from_legacy_json(raw, slide_index=index))
        elif isinstance(raw, str):
            out_slides.append(_slide_from_html_payload({"html": raw}, slide_index=index))

    _enforce_image_ref_unique(out_slides)
    sanitized["slides"] = out_slides
    sanitized["presentation_format"] = PRESENTATION_FORMAT_HTML_V1
    return sanitized


def postprocess(raw: str, expected_slides_count: int | None = None) -> dict:
    """Parse, validate, and sanitize a raw Claude JSON response, raising ValueError on failure."""
    data = parse_json(raw)
    validate_structure(data, expected_slides_count=expected_slides_count)
    return sanitize_slides(data)


def postprocess_single_slide(raw: str) -> dict:
    """Parse and sanitize a single slide JSON response into the {html, metadata} shape."""
    item = parse_json(raw)
    if not isinstance(item, dict):
        raise ValueError("Refined slide response must be a JSON object.")
    if _looks_like_html_payload(item):
        return _slide_from_html_payload(item, slide_index=1)
    return _slide_from_legacy_json(item, slide_index=1)
