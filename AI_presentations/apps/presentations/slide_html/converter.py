"""Convert legacy JSON-shaped slides (``type``, ``bullets``, ...) into HTML.

The converter is the only place that knows how to map the old slide shapes to
the canonical HTML format. It is used both at presentation render time (lazy
adapter for un-migrated rows) and by the data backfill management command.
"""

from __future__ import annotations

import html as html_mod
from typing import Any, Iterable

from .sanitizer import sanitize_slide_html


_LEGACY_TYPES = frozenset({"title", "content", "two_column", "quote", "stats", "cta"})


def _esc(value: Any) -> str:
    return html_mod.escape("" if value is None else str(value), quote=True)


def _bullets_from_legacy(slide: dict) -> list[str]:
    bullets = slide.get("bullets")
    if isinstance(bullets, list):
        out = [str(x) for x in bullets if isinstance(x, str) and x.strip()]
        if out:
            return out
    content = slide.get("content")
    if isinstance(content, list):
        return [str(x) for x in content if isinstance(x, str) and x.strip()]
    if isinstance(content, dict):
        for key in ("bullets", "items", "points"):
            arr = content.get(key)
            if isinstance(arr, list):
                return [str(x) for x in arr if isinstance(x, str) and x.strip()]
    return []


def _subtitle_from_legacy(slide: dict) -> str:
    subtitle = slide.get("subtitle")
    if isinstance(subtitle, str) and subtitle.strip():
        return subtitle.strip()
    content = slide.get("content")
    if isinstance(content, dict):
        for key in ("subtitle", "text", "summary"):
            v = content.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    if slide.get("type") == "title" and isinstance(content, str) and content.strip():
        return content.strip()
    return ""


def _stats_from_legacy(slide: dict) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    raw = slide.get("stats")
    if not isinstance(raw, list):
        content = slide.get("content")
        if isinstance(content, dict):
            raw = content.get("stats")
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            value = str(item.get("value", "")).strip()
            label = str(item.get("label", "")).strip()
            if value or label:
                out.append({"value": value, "label": label})
    return out


def _two_column_from_legacy(slide: dict) -> tuple[list[str], list[str]]:
    """Return (left, right) bullet lists for a two_column slide."""
    content = slide.get("content")
    left: list[str] = []
    right: list[str] = []
    if isinstance(content, dict):
        for key in ("left", "first", "primary", "a"):
            v = content.get(key)
            if isinstance(v, list):
                left = [str(x) for x in v if isinstance(x, str) and x.strip()]
                break
            if isinstance(v, dict):
                items = v.get("items") or v.get("bullets")
                if isinstance(items, list):
                    left = [str(x) for x in items if isinstance(x, str) and x.strip()]
                    break
        for key in ("right", "second", "secondary", "b"):
            v = content.get(key)
            if isinstance(v, list):
                right = [str(x) for x in v if isinstance(x, str) and x.strip()]
                break
            if isinstance(v, dict):
                items = v.get("items") or v.get("bullets")
                if isinstance(items, list):
                    right = [str(x) for x in items if isinstance(x, str) and x.strip()]
                    break
    if not left and not right:
        bullets = _bullets_from_legacy(slide)
        midpoint = len(bullets) // 2 + len(bullets) % 2
        left = bullets[:midpoint]
        right = bullets[midpoint:]
    return left, right


def _bullet_markers(slide: dict, count: int) -> list[str]:
    markers = slide.get("bulletMarkers")
    if not isinstance(markers, list):
        content = slide.get("content")
        if isinstance(content, dict):
            markers = content.get("bulletMarkers")
    if isinstance(markers, list):
        out = []
        for i in range(count):
            v = markers[i] if i < len(markers) else None
            out.append(str(v) if v is not None else f"{i + 1:02d}")
        return out
    return [f"{i + 1:02d}" for i in range(count)]


def _bullets_html(bullets: Iterable[str], markers: list[str]) -> str:
    parts: list[str] = ["<ul class=\"slide-bullets\">"]
    for i, item in enumerate(bullets):
        marker = markers[i] if i < len(markers) else f"{i + 1:02d}"
        parts.append(
            "<li><span class=\"slide-bullet-marker\" data-marker=\"true\">"
            f"{_esc(marker)}</span><span class=\"slide-bullet-text\">{_esc(item)}</span></li>"
        )
    parts.append("</ul>")
    return "".join(parts)


def _stats_html(stats: list[dict[str, str]]) -> str:
    parts: list[str] = ["<ul class=\"slide-stats\" data-slot=\"stats\">"]
    for s in stats:
        parts.append(
            "<li class=\"slide-stat\">"
            f"<span class=\"slide-stat-value\">{_esc(s.get('value', ''))}</span>"
            f"<span class=\"slide-stat-label\">{_esc(s.get('label', ''))}</span>"
            "</li>"
        )
    parts.append("</ul>")
    return "".join(parts)


def _column_html(items: list[str], cls: str) -> str:
    if not items:
        return f"<div class=\"slide-column {cls}\"></div>"
    lis = "".join(f"<li>{_esc(x)}</li>" for x in items)
    return f"<div class=\"slide-column {cls}\"><ul>{lis}</ul></div>"


def _attr(name: str, value: str) -> str:
    if value is None or value == "":
        return ""
    return f" {name}=\"{_esc(value)}\""


def _section_open(layout: str, *, slide_id: str = "", icon: str = "", image_ref: str = "") -> str:
    icon_attr = _attr("data-icon", icon) if icon else ""
    image_attr = _attr("data-image-ref", image_ref) if image_ref else ""
    id_attr = _attr("id", slide_id) if slide_id else ""
    return (
        f"<section class=\"slide slide-{layout}\""
        f" data-layout=\"{_esc(layout)}\""
        " data-format=\"html_v1\""
        f"{id_attr}{icon_attr}{image_attr}>"
    )


def _layout_for(slide: dict) -> str:
    raw_type = slide.get("type")
    if isinstance(raw_type, str) and raw_type in _LEGACY_TYPES:
        return raw_type
    return "content"


def json_slide_to_html(slide: dict) -> str:
    """Return a sanitized HTML fragment for a legacy JSON slide."""
    if not isinstance(slide, dict):
        return ""

    layout = _layout_for(slide)
    title = str(slide.get("title") or "").strip()
    subtitle = _subtitle_from_legacy(slide)
    bullets = _bullets_from_legacy(slide)
    stats = _stats_from_legacy(slide)
    icon = str(slide.get("icon") or "").strip()
    image_ref = "primary" if slide.get("image") is True else ""
    sid = str(slide.get("_sid") or "").strip()
    chart = slide.get("chart") if isinstance(slide.get("chart"), dict) else None

    parts: list[str] = [_section_open(layout, slide_id=sid, icon=icon, image_ref=image_ref)]

    if layout == "title":
        parts.append("<header class=\"slide-header\">")
        if icon:
            parts.append(f"<div class=\"slide-icon\" aria-hidden=\"true\">{_esc(icon)}</div>")
        parts.append(f"<h1 class=\"slide-title\">{_esc(title)}</h1>")
        if subtitle:
            parts.append(f"<p class=\"slide-subtitle\">{_esc(subtitle)}</p>")
        parts.append("</header>")
    elif layout == "quote":
        parts.append("<blockquote class=\"slide-quote\">")
        body = subtitle or " ".join(bullets) or title
        parts.append(f"<p>{_esc(body)}</p>")
        if title and body and title != body:
            parts.append(f"<cite>{_esc(title)}</cite>")
        parts.append("</blockquote>")
    elif layout == "two_column":
        left, right = _two_column_from_legacy(slide)
        parts.append(f"<h2 class=\"slide-title\">{_esc(title)}</h2>")
        if subtitle:
            parts.append(f"<p class=\"slide-subtitle\">{_esc(subtitle)}</p>")
        parts.append("<div class=\"slide-columns\" data-slot=\"columns\">")
        parts.append(_column_html(left, "slide-column-left"))
        parts.append(_column_html(right, "slide-column-right"))
        parts.append("</div>")
    elif layout == "stats":
        parts.append(f"<h2 class=\"slide-title\">{_esc(title)}</h2>")
        if subtitle:
            parts.append(f"<p class=\"slide-subtitle\">{_esc(subtitle)}</p>")
        if stats:
            parts.append(_stats_html(stats))
        if bullets:
            markers = _bullet_markers(slide, len(bullets))
            parts.append(_bullets_html(bullets, markers))
    elif layout == "cta":
        parts.append("<header class=\"slide-header\">")
        parts.append(f"<h2 class=\"slide-title\">{_esc(title)}</h2>")
        if subtitle:
            parts.append(f"<p class=\"slide-subtitle\">{_esc(subtitle)}</p>")
        parts.append("</header>")
        if bullets:
            markers = _bullet_markers(slide, len(bullets))
            parts.append(_bullets_html(bullets, markers))
    else:  # "content" and any unknown
        parts.append(f"<h2 class=\"slide-title\">{_esc(title)}</h2>")
        if subtitle:
            parts.append(f"<p class=\"slide-subtitle\">{_esc(subtitle)}</p>")
        if bullets:
            markers = _bullet_markers(slide, len(bullets))
            parts.append(_bullets_html(bullets, markers))
        if stats:
            parts.append(_stats_html(stats))

    if image_ref:
        parts.append(
            "<figure class=\"slide-image\" data-slot=\"image\">"
            "<img src=\"cid:primary\" alt=\"\" data-asset=\"primary\"/>"
            "</figure>"
        )

    if chart and isinstance(chart, dict) and isinstance(chart.get("data"), list):
        # We render chart as a figcaption-ish block for HTML viewers; PPTX export
        # consumes the structured ``metadata.chart`` instead of parsing this back.
        try:
            parts.append("<figure class=\"slide-chart\" data-slot=\"chart\">")
            chart_title = str(chart.get("title") or "").strip()
            if chart_title:
                parts.append(f"<figcaption>{_esc(chart_title)}</figcaption>")
            parts.append("<ul class=\"slide-chart-bars\">")
            for item in chart.get("data", []):
                if not isinstance(item, dict):
                    continue
                label = str(item.get("label") or "")
                value = item.get("value")
                parts.append(
                    "<li>"
                    f"<span class=\"slide-chart-label\">{_esc(label)}</span>"
                    f"<span class=\"slide-chart-value\">{_esc(value)}</span>"
                    "</li>"
                )
            parts.append("</ul>")
            parts.append("</figure>")
        except Exception:
            # Defensive: a malformed chart should not break the slide.
            pass

    parts.append("</section>")
    return sanitize_slide_html("".join(parts))


def json_deck_to_html(slides: list[dict]) -> list[str]:
    """Convert each legacy slide dict to a sanitized HTML fragment."""
    if not isinstance(slides, list):
        return []
    return [json_slide_to_html(s) if isinstance(s, dict) else "" for s in slides]
