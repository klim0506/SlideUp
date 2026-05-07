from django.template.loader import render_to_string

from apps.presentations.themes import resolve_export_theme


def _theme_for(presentation_data: dict):
    """Return theme colors for export HTML/PDF."""
    return resolve_export_theme(presentation_data if isinstance(presentation_data, dict) else {"theme": presentation_data})


def _normalize_slide(slide):
    """Return a copy of a slide with template-friendly subtitle and bullet fields."""
    normalized = dict(slide)
    content = normalized.get("content")
    normalized["render_subtitle"] = normalized.get("subtitle")
    normalized["render_bullets"] = normalized.get("bullets") if isinstance(normalized.get("bullets"), list) else []

    if isinstance(content, dict):
        normalized["render_subtitle"] = (
            normalized["render_subtitle"]
            or content.get("subtitle")
            or content.get("text")
        )
        content_bullets = content.get("bullets") or content.get("items")
        if isinstance(content_bullets, list) and not normalized["render_bullets"]:
            normalized["render_bullets"] = content_bullets
    elif isinstance(content, list) and not normalized["render_bullets"]:
        normalized["render_bullets"] = content
    elif isinstance(content, str):
        normalized["render_subtitle"] = normalized["render_subtitle"] or content
        if not normalized["render_bullets"]:
            normalized["render_bullets"] = [content]

    normalized["render_bullets"] = [
        str(item) for item in normalized["render_bullets"] if isinstance(item, str)
    ]
    return normalized


def _normalize_slides(slides):
    """Return a list of slides normalized for the export HTML template."""
    return [_normalize_slide(slide) for slide in slides if isinstance(slide, dict)]


def generate_html(presentation_data: dict, watermark: bool = False) -> str:
    """Render the presentation as standalone HTML (same template as PDF export)."""
    return render_to_string(
        "exports/presentation.html",
        {
            "presentation": presentation_data,
            "slides": _normalize_slides(presentation_data.get("slides") or []),
            "theme": _theme_for(presentation_data),
            "watermark": watermark,
        },
    )


def generate_pdf(presentation_data: dict, watermark: bool = False) -> bytes:
    """Render a presentation HTML template with theme colors and return a PDF as bytes."""
    from weasyprint import HTML

    return HTML(string=generate_html(presentation_data, watermark)).write_pdf()
