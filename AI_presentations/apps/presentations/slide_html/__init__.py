"""HTML-as-canonical-format primitives for presentation slides.

Public surface kept thin: the rest of the app should import from this package
rather than reaching into individual modules.
"""

from .sanitizer import (
    SLIDE_HTML_ALLOWED_ATTRS,
    SLIDE_HTML_ALLOWED_CSS,
    SLIDE_HTML_ALLOWED_TAGS,
    sanitize_slide_html,
    strip_to_text,
)
from .converter import json_slide_to_html, json_deck_to_html
from .renderer import (
    PRESENTATION_FORMAT_HTML_V1,
    PRESENTATION_FORMAT_JSON_V1,
    SLIDE_SID_KEY,
    coerce_html_slide,
    ensure_html_slide,
    ensure_html_slides,
    get_slide_html,
    get_slide_metadata,
    iter_html_slides,
    metadata_for_legacy_slide,
    presentation_to_html_payload,
)

__all__ = [
    "PRESENTATION_FORMAT_HTML_V1",
    "PRESENTATION_FORMAT_JSON_V1",
    "SLIDE_HTML_ALLOWED_ATTRS",
    "SLIDE_HTML_ALLOWED_CSS",
    "SLIDE_HTML_ALLOWED_TAGS",
    "SLIDE_SID_KEY",
    "coerce_html_slide",
    "ensure_html_slide",
    "ensure_html_slides",
    "get_slide_html",
    "get_slide_metadata",
    "iter_html_slides",
    "json_deck_to_html",
    "json_slide_to_html",
    "metadata_for_legacy_slide",
    "presentation_to_html_payload",
    "sanitize_slide_html",
    "strip_to_text",
]
