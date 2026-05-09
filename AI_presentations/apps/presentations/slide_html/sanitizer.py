"""Server-side sanitizer for slide HTML.

The sanitizer enforces the HTML subset that the rest of the engine treats as
trusted: a permissive whitelist of structural and SVG tags, a tag-aware
attribute whitelist (including inline SVG attributes and a broad CSS-property
allowlist for layout/visual freedom), and a strict URL-scheme whitelist that
allows referencing slide assets via the ``cid:`` scheme.

The whitelist is intentionally wide so the model can generate rich,
information-dense slides (multi-column grids, SVG infographics, custom
backgrounds). Anything that can execute JavaScript or load external active
content is still stripped: ``script``, ``style``, ``iframe``, ``object``,
``embed``, ``form``, ``link``, ``meta``, all ``on*`` event handlers, and
``javascript:``/``vbscript:`` URIs.
"""

from __future__ import annotations

import re
from html import unescape
from typing import Iterable

import bleach
from bleach.css_sanitizer import CSSSanitizer


# Structural HTML tags. Includes the core slide skeleton plus common
# semantic and table tags. SVG tags are listed below and merged in.
_HTML_TAGS: frozenset[str] = frozenset({
    "section",
    "article",
    "aside",
    "nav",
    "header",
    "footer",
    "main",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "ul",
    "ol",
    "li",
    "dl",
    "dt",
    "dd",
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
    "wbr",
    "span",
    "div",
    "figure",
    "figcaption",
    "img",
    "picture",
    "source",
    "table",
    "thead",
    "tbody",
    "tfoot",
    "tr",
    "td",
    "th",
    "caption",
    "colgroup",
    "col",
    "code",
    "pre",
    "kbd",
    "abbr",
    "samp",
    "var",
    "sub",
    "sup",
    "time",
    "address",
    "details",
    "summary",
    "progress",
    "meter",
    "hr",
    "q",
    "ruby",
    "rt",
    "rp",
    "del",
    "ins",
})


# Inline SVG tags. html5lib parses elements inside <svg> in foreign-content
# mode and preserves their case (e.g. ``linearGradient``), so we must list
# both the canonical camelCase form AND the lowercase form to be safe across
# html5lib versions.
_SVG_TAGS: frozenset[str] = frozenset({
    "svg",
    "g",
    "defs",
    "use",
    "symbol",
    "title",
    "desc",
    "path",
    "circle",
    "ellipse",
    "rect",
    "line",
    "polyline",
    "polygon",
    "text",
    "tspan",
    "textPath",
    "textpath",
    "linearGradient",
    "lineargradient",
    "radialGradient",
    "radialgradient",
    "stop",
    "clipPath",
    "clippath",
    "mask",
    "pattern",
    "marker",
    "foreignObject",
    "foreignobject",
    "filter",
    "feGaussianBlur",
    "fegaussianblur",
    "feOffset",
    "feoffset",
    "feMerge",
    "femerge",
    "feMergeNode",
    "femergenode",
    "feColorMatrix",
    "fecolormatrix",
    "feDropShadow",
    "fedropshadow",
    "feBlend",
    "feblend",
    "feFlood",
    "feflood",
    "feComposite",
    "fecomposite",
})


SLIDE_HTML_ALLOWED_TAGS: frozenset[str] = _HTML_TAGS | _SVG_TAGS


# Attributes allowed on every tag (these never carry behaviour).
_GLOBAL_ATTRS = frozenset({
    "class",
    "id",
    "style",
    "title",
    "lang",
    "dir",
    "role",
    "tabindex",
    "aria-label",
    "aria-labelledby",
    "aria-describedby",
    "aria-hidden",
    "data-layout",
    "data-role",
    "data-slot",
    "data-marker",
    "data-icon",
    "data-image-ref",
    "data-format",
    "data-asset",
    "data-variant",
    "data-tone",
    "data-accent",
    "data-step",
    "data-index",
})


# Per-tag extra attributes. SVG attributes are pooled because the same
# attribute names appear across many SVG elements.
_SVG_ATTRS = frozenset({
    "viewbox",
    "xmlns",
    "xmlns:xlink",
    "preserveaspectratio",
    "fill",
    "fill-opacity",
    "fill-rule",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-miterlimit",
    "opacity",
    "transform",
    "transform-origin",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "x",
    "y",
    "x1",
    "y1",
    "x2",
    "y2",
    "d",
    "points",
    "width",
    "height",
    "dx",
    "dy",
    "offset",
    "stop-color",
    "stop-opacity",
    "gradientunits",
    "gradienttransform",
    "spreadmethod",
    "patternunits",
    "patterncontentunits",
    "patterntransform",
    "maskunits",
    "clip-path",
    "clippathunits",
    "mask",
    "filter",
    "text-anchor",
    "dominant-baseline",
    "alignment-baseline",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "letter-spacing",
    "text-decoration",
    "vector-effect",
    "paint-order",
    "stdDeviation".lower(),
    "in",
    "in2",
    "result",
    "type",
    "values",
    "href",
    "xlink:href",
    "from",
    "to",
    "begin",
    "dur",
    "repeatcount",
    "color",
    "stop-color",
    "marker-end",
    "marker-start",
    "marker-mid",
    "orient",
})


SLIDE_HTML_ALLOWED_ATTRS: dict[str, list[str]] = {
    "*": sorted(_GLOBAL_ATTRS),
    "a": ["href", "rel", "target", "download"],
    "img": ["src", "alt", "width", "height", "loading", "decoding", "srcset", "sizes"],
    "source": ["src", "srcset", "type", "media", "sizes"],
    "th": ["scope", "colspan", "rowspan", "abbr", "headers"],
    "td": ["colspan", "rowspan", "headers"],
    "ol": ["start", "type", "reversed"],
    "li": ["value"],
    "section": ["data-format"],
    "blockquote": ["cite"],
    "q": ["cite"],
    "del": ["cite", "datetime"],
    "ins": ["cite", "datetime"],
    "time": ["datetime"],
    "details": ["open"],
    "progress": ["value", "max"],
    "meter": ["value", "min", "max", "low", "high", "optimum"],
    "abbr": ["title"],
    "table": ["summary"],
}

# Pool SVG attrs onto every SVG tag so the filter can accept them generically.
for _svg_tag in _SVG_TAGS:
    SLIDE_HTML_ALLOWED_ATTRS[_svg_tag] = sorted(_SVG_ATTRS)


# Whitelisted CSS properties allowed inside ``style`` attributes. The list
# is broad on purpose so the model has the visual range of a designer
# (grids, flex, backgrounds, gradients, transforms, shadows, filters).
SLIDE_HTML_ALLOWED_CSS: list[str] = [
    # Color & typography
    "color",
    "background",
    "background-color",
    "background-image",
    "background-position",
    "background-size",
    "background-repeat",
    "background-clip",
    "background-origin",
    "font",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-variant",
    "font-stretch",
    "text-align",
    "text-decoration",
    "text-decoration-color",
    "text-decoration-style",
    "text-decoration-thickness",
    "text-transform",
    "text-shadow",
    "text-overflow",
    "letter-spacing",
    "word-spacing",
    "white-space",
    "line-height",
    "vertical-align",
    "list-style",
    "list-style-type",
    "list-style-position",
    "list-style-image",
    # Box model
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "padding-block",
    "padding-inline",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "margin-block",
    "margin-inline",
    "border",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-color",
    "border-radius",
    "border-style",
    "border-width",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-image",
    "outline",
    "outline-color",
    "outline-style",
    "outline-width",
    "outline-offset",
    "box-shadow",
    "box-sizing",
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "aspect-ratio",
    # Layout
    "display",
    "flex",
    "flex-direction",
    "flex-wrap",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "justify-content",
    "justify-items",
    "justify-self",
    "align-items",
    "align-content",
    "align-self",
    "place-items",
    "place-content",
    "place-self",
    "gap",
    "row-gap",
    "column-gap",
    "grid",
    "grid-template",
    "grid-template-columns",
    "grid-template-rows",
    "grid-template-areas",
    "grid-area",
    "grid-column",
    "grid-row",
    "grid-auto-flow",
    "grid-auto-columns",
    "grid-auto-rows",
    "order",
    # Position & visibility
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "inset",
    "z-index",
    "overflow",
    "overflow-x",
    "overflow-y",
    "visibility",
    "opacity",
    "isolation",
    "mix-blend-mode",
    # Transforms / effects
    "transform",
    "transform-origin",
    "rotate",
    "scale",
    "translate",
    "filter",
    "backdrop-filter",
    "clip-path",
    "object-fit",
    "object-position",
    # Misc
    "cursor",
    "pointer-events",
    "user-select",
    "columns",
    "column-count",
    "column-gap",
    "column-rule",
    "break-inside",
    "break-before",
    "break-after",
    "writing-mode",
    "text-orientation",
    "scroll-behavior",
    "transition",
    "animation",
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


_URL_ATTRS = {"href", "src", "xlink:href", "srcset"}


def _attr_filter(tag: str, name: str, value: str) -> bool:
    """Bleach attribute callback: tag-specific whitelist + URL scheme guard."""
    name_lc = name.lower()
    # Always strip on*-handlers, even before whitelist lookup.
    if name_lc.startswith("on"):
        return False
    allowed_global = SLIDE_HTML_ALLOWED_ATTRS.get("*", [])
    allowed_tag = SLIDE_HTML_ALLOWED_ATTRS.get(tag, [])
    if name_lc not in allowed_global and name_lc not in allowed_tag:
        # Permit aria-* / data-* generically. Specific data-* entries above
        # are kept for clarity; this catches the long tail.
        if not (name_lc.startswith("data-") or name_lc.startswith("aria-")):
            return False
    if name_lc in _URL_ATTRS:
        return _allow_url(tag, name_lc, value)
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
