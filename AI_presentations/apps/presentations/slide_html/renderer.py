"""Unified entry point for reading slides regardless of storage format.

Callers should not branch on ``presentation_format`` themselves; instead they
call :func:`presentation_to_html_payload` (for renderers/exports) or iterate
slides via :func:`iter_html_slides`. The renderer handles the lazy adapter for
legacy ``json_v1`` rows so they keep working until the backfill command runs.
"""

from __future__ import annotations

from typing import Any, Iterable, Iterator

from .converter import json_slide_to_html
from .sanitizer import sanitize_slide_html, strip_to_text


PRESENTATION_FORMAT_JSON_V1 = "json_v1"
PRESENTATION_FORMAT_HTML_V1 = "html_v1"

SLIDE_SID_KEY = "_sid"


def _is_html_slide(slide: Any) -> bool:
    return isinstance(slide, dict) and isinstance(slide.get("html"), str) and slide["html"].strip() != ""


def metadata_for_legacy_slide(slide: dict) -> dict:
    """Extract metadata fields that need to be preserved when wrapping a JSON slide."""
    if not isinstance(slide, dict):
        return {}
    md: dict[str, Any] = {}
    layout = slide.get("type")
    if isinstance(layout, str) and layout:
        md["layout"] = layout
    title = slide.get("title")
    if isinstance(title, str) and title.strip():
        md["title"] = title.strip()
    icon = slide.get("icon")
    if isinstance(icon, str) and icon.strip():
        md["icon"] = icon.strip()
    if slide.get("image") is True:
        md["image_ref"] = "primary"
    chart = slide.get("chart")
    if isinstance(chart, dict) and isinstance(chart.get("data"), list):
        md["chart"] = chart
    notes = slide.get("notes")
    if isinstance(notes, str) and notes.strip():
        md["notes"] = notes.strip()
    return md


def coerce_html_slide(slide: Any) -> dict:
    """Return a slide dict with sanitized ``html`` and ``metadata`` populated.

    Accepts:
      * already-converted html slides (re-sanitizes html, fills missing metadata),
      * legacy JSON slides (converts via :func:`json_slide_to_html`),
      * raw strings (treated as html with no metadata).
    """
    if isinstance(slide, str):
        cleaned = sanitize_slide_html(slide)
        return {"html": cleaned, "metadata": {}}
    if not isinstance(slide, dict):
        return {"html": "", "metadata": {}}

    if _is_html_slide(slide):
        cleaned = sanitize_slide_html(slide["html"])
        metadata = slide.get("metadata") if isinstance(slide.get("metadata"), dict) else {}
        if not metadata.get("title"):
            extracted = strip_to_text(cleaned, max_len=120)
            if extracted:
                metadata = {**metadata, "title": extracted.split(".")[0][:80]}
        out: dict[str, Any] = {"html": cleaned, "metadata": metadata}
        sid = slide.get(SLIDE_SID_KEY)
        if isinstance(sid, str) and sid:
            out[SLIDE_SID_KEY] = sid
        return out

    # Legacy JSON slide — convert lazily.
    cleaned = json_slide_to_html(slide)
    metadata = metadata_for_legacy_slide(slide)
    out = {"html": cleaned, "metadata": metadata}
    sid = slide.get(SLIDE_SID_KEY)
    if isinstance(sid, str) and sid:
        out[SLIDE_SID_KEY] = sid
    return out


def ensure_html_slide(slide: Any) -> dict:
    """Like :func:`coerce_html_slide` but always returns a non-empty html string."""
    out = coerce_html_slide(slide)
    if not out["html"]:
        # Fall back to a blank slide rather than dropping the slot.
        out["html"] = (
            "<section class=\"slide slide-content\" data-layout=\"content\""
            " data-format=\"html_v1\"><h2 class=\"slide-title\">Без названия</h2></section>"
        )
    return out


def ensure_html_slides(slides: Iterable[Any]) -> list[dict]:
    return [ensure_html_slide(s) for s in (slides or [])]


def iter_html_slides(presentation_data: dict) -> Iterator[dict]:
    """Iterate slides as html-shaped dicts regardless of stored format."""
    slides = presentation_data.get("slides") if isinstance(presentation_data, dict) else None
    if not isinstance(slides, list):
        return iter(())
    return iter(coerce_html_slide(s) for s in slides)


def get_slide_html(slide: Any) -> str:
    return coerce_html_slide(slide)["html"]


def get_slide_metadata(slide: Any) -> dict:
    return coerce_html_slide(slide).get("metadata", {})


def presentation_to_html_payload(presentation_data: dict) -> dict:
    """Return a dict shaped like the original payload but with html slides materialized.

    The output preserves: id, title, theme, theme_custom, assets, presentation_format.
    The ``slides`` field is a list of ``{html, metadata, _sid?}`` dicts.
    """
    payload = dict(presentation_data) if isinstance(presentation_data, dict) else {}
    payload["slides"] = list(iter_html_slides(presentation_data))
    payload["presentation_format"] = PRESENTATION_FORMAT_HTML_V1
    return payload
