"""Server-side sanitizer for slide HTML.

The sanitizer enforces the HTML subset that the rest of the engine treats as
trusted: a small whitelist of structural tags, a whitelist of attributes
(including a tiny whitelist of inline-style properties), and a strict URL-scheme
whitelist that allows referencing slide assets via the ``cid:`` scheme.
"""

from __future__ import annotations

import re
from html import unescape
from typing import Iterable

import bleach
from bleach.css_sanitizer import CSSSanitizer


SLIDE_HTML_ALLOWED_TAGS: frozenset[str] = frozenset({
    "section",
    "header",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "p",
    "ul",
    "ol",
    "li",
    "blockquote",
    "cite",
    "strong",
    "em",
    "b",
    "i",
    "u",
    "s",
    "small",
    "mark",
    "br",
    "span",
    "div",
    "figure",
    "figcaption",
    "img",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "code",
    "pre",
    "kbd",
    "abbr",
    "hr",
})


SLIDE_HTML_ALLOWED_ATTRS: dict[str, list[str]] = {
    "*": ["class", "data-layout", "data-role", "data-slot", "data-marker", "style"],
    "a": ["href", "title", "rel", "target"],
    "img": ["src", "alt", "title", "width", "height", "data-asset"],
    "th": ["scope", "colspan", "rowspan"],
    "td": ["colspan", "rowspan"],
    "ol": ["start", "type"],
    "section": ["id", "data-layout", "data-format", "data-icon", "data-image-ref"],
    "blockquote": ["cite"],
}


# Whitelisted CSS properties allowed inside ``style`` attributes.
SLIDE_HTML_ALLOWED_CSS: list[str] = [
    "color",
    "background-color",
    "font-size",
    "font-weight",
    "font-style",
    "text-align",
    "text-decoration",
    "letter-spacing",
    "line-height",
    "list-style",
    "padding",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "margin",
    "margin-top",
    "margin-bottom",
    "margin-left",
    "margin-right",
    "border",
    "border-color",
    "border-radius",
    "border-style",
    "border-width",
    "width",
    "height",
    "max-width",
    "max-height",
    "display",
    "grid-template-columns",
    "gap",
    "opacity",
]


# Allowed URI schemes. ``cid:`` lets slides reference assets bundled with the
# presentation (resolved on render); ``data:image/...`` is allowed for inlined
# images, and ``http(s):`` for safe external image hosts (callers should still
# treat external content with care).
_ALLOWED_PROTOCOLS = frozenset({"http", "https", "cid", "mailto"})


_DATA_URI_RE = re.compile(r"^data:image/(?:png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$")
_DANGEROUS_URI_RE = re.compile(r"^\s*(?:javascript|vbscript|file|about):", re.IGNORECASE)


def _allow_url(attr: str, name: str, value: str) -> bool:
    if not isinstance(value, str):
        return False
    value = value.strip()
    if not value:
        return False
    if _DANGEROUS_URI_RE.match(value):
        return False
    if value.startswith("data:"):
        return bool(_DATA_URI_RE.match(value))
    # Relative URLs (no scheme) are allowed for href targets like anchors.
    if "://" not in value and not value.startswith("cid:") and not value.startswith("mailto:"):
        return value.startswith("#") or value.startswith("/")
    scheme = value.split(":", 1)[0].lower()
    return scheme in _ALLOWED_PROTOCOLS


def _attr_filter(tag: str, name: str, value: str) -> bool:
    """Bleach attribute callback: tag-specific whitelist + URL scheme guard."""
    allowed_global = SLIDE_HTML_ALLOWED_ATTRS.get("*", [])
    allowed_tag = SLIDE_HTML_ALLOWED_ATTRS.get(tag, [])
    if name not in allowed_global and name not in allowed_tag:
        return False
    if name in {"href", "src"}:
        return _allow_url(tag, name, value)
    if name.startswith("on"):  # belt and suspenders: bleach already strips these
        return False
    return True


_CSS_SANITIZER = CSSSanitizer(allowed_css_properties=SLIDE_HTML_ALLOWED_CSS)

_WHITESPACE_RE = re.compile(r"\s+")


def sanitize_slide_html(raw_html: str | None) -> str:
    """Return a sanitized copy of slide HTML.

    Strips disallowed tags/attributes, enforces a URL-scheme whitelist, and
    keeps only whitelisted CSS properties in ``style`` attributes. Empty or
    non-string inputs return ``""``.
    """
    if not isinstance(raw_html, str):
        return ""
    if not raw_html.strip():
        return ""
    cleaned = bleach.clean(
        raw_html,
        tags=SLIDE_HTML_ALLOWED_TAGS,
        attributes=_attr_filter,
        css_sanitizer=_CSS_SANITIZER,
        protocols=list(_ALLOWED_PROTOCOLS),
        strip=True,
        strip_comments=True,
    )
    return cleaned.strip()


_TAG_RE = re.compile(r"<[^>]+>")


def strip_to_text(html: str | None, *, max_len: int | None = None) -> str:
    """Best-effort extraction of plain text from a sanitized HTML fragment."""
    if not isinstance(html, str) or not html:
        return ""
    text = unescape(_TAG_RE.sub(" ", html))
    text = _WHITESPACE_RE.sub(" ", text).strip()
    if max_len is not None and len(text) > max_len:
        text = text[: max(max_len - 1, 0)].rstrip() + "…"
    return text


def is_clean_slide_html(html: str | None) -> bool:
    """Return True if sanitization is a no-op for this fragment."""
    if not isinstance(html, str):
        return False
    return sanitize_slide_html(html) == html.strip()


def warn_unknown_tags(html: str, *, allowed: Iterable[str] = SLIDE_HTML_ALLOWED_TAGS) -> list[str]:
    """Return a sorted list of tags present in ``html`` that aren't in the whitelist."""
    found = set()
    for match in re.finditer(r"<\s*([a-zA-Z][a-zA-Z0-9]*)", html):
        found.add(match.group(1).lower())
    return sorted(found - set(allowed))
