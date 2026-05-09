"""HTML and PDF export — both render the canonical sanitized slide HTML."""

from __future__ import annotations

import logging
import re
import time
from typing import Iterable

from django.template.loader import render_to_string
from django.utils.safestring import mark_safe

from apps.presentations.slide_html import (
    coerce_html_slide,
    sanitize_slide_html,
)
from apps.presentations.themes import resolve_export_theme


logger = logging.getLogger(__name__)


_CID_RE = re.compile(r"src=\"cid:([^\"]+)\"")


def _theme_for(presentation_data: dict):
    """Return theme colors for export HTML/PDF."""
    return resolve_export_theme(
        presentation_data if isinstance(presentation_data, dict) else {"theme": presentation_data}
    )


def _resolve_assets(html: str, assets: dict | None) -> str:
    """Replace ``cid:`` references with embedded data URIs from the assets bag."""
    if not html or not assets:
        return html
    images = assets.get("images") if isinstance(assets, dict) else None
    if not images:
        return html

    def _replace(match: re.Match) -> str:
        ref = match.group(1)
        # ``primary`` always resolves to the first uploaded image.
        if ref == "primary":
            img = images[0] if images else None
        else:
            img = next(
                (i for i in images if isinstance(i, dict) and i.get("name") == ref),
                None,
            )
        if not img or not isinstance(img, dict) or not img.get("data_b64"):
            return 'src=""'
        media_type = img.get("media_type") or "image/jpeg"
        return f'src="data:{media_type};base64,{img["data_b64"]}"'

    return _CID_RE.sub(_replace, html)


def _normalize_slides(slides: Iterable[dict], *, assets: dict | None) -> list[dict]:
    """Materialize html for every slide and inline asset references for export."""
    out = []
    total = sum(1 for _ in slides) if not isinstance(slides, list) else len(slides)
    iterable = slides if isinstance(slides, list) else list(slides)
    for index, raw in enumerate(iterable, start=1):
        coerced = coerce_html_slide(raw)
        html = sanitize_slide_html(coerced.get("html", ""))
        html = _resolve_assets(html, assets)
        page_label = f"{index:02d} / {total:02d}"
        out.append(
            {
                "html": mark_safe(html),
                "metadata": coerced.get("metadata", {}),
                "page_label": page_label,
                "index": index,
            }
        )
    return out


def generate_html(presentation_data: dict, watermark: bool = False) -> str:
    """Render the presentation as standalone HTML (same template as PDF export)."""
    started = time.monotonic()
    slides = _normalize_slides(
        presentation_data.get("slides") or [],
        assets=presentation_data.get("assets"),
    )
    rendered = render_to_string(
        "exports/presentation.html",
        {
            "presentation": presentation_data,
            "slides": slides,
            "theme": _theme_for(presentation_data),
            "watermark": watermark,
        },
    )
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "export.html rendered slides=%d duration_ms=%d size=%d",
        len(slides),
        duration_ms,
        len(rendered),
    )
    return rendered


def generate_pdf(presentation_data: dict, watermark: bool = False) -> bytes:
    """Render the presentation HTML and return a PDF binary."""
    from weasyprint import HTML  # heavy import; keep lazy

    started = time.monotonic()
    html = generate_html(presentation_data, watermark)
    pdf_bytes = HTML(string=html).write_pdf()
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "export.pdf rendered bytes=%d duration_ms=%d",
        len(pdf_bytes),
        duration_ms,
    )
    return pdf_bytes
