"""Generate PPTX files from canonical HTML slides via an lxml-based mapper.

The mapper reads each slide's sanitized html and translates a small whitelist
of structural elements (h1/h2, p, ul/ol, blockquote, figure/img, table) into
python-pptx shapes. Non-text elements like ``metadata.chart`` and assets are
read from the slide's structured side-data so the PPTX can carry a real chart
and embed images verbatim. Anything unknown falls back to plain text rather
than blowing up the export.
"""

from __future__ import annotations

import base64
import logging
import time
from io import BytesIO
from typing import Any, Iterable

from lxml import html as lxml_html

from apps.presentations.slide_html import (
    coerce_html_slide,
    strip_to_text,
)
from apps.presentations.themes import resolve_export_theme


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Color helpers
# ---------------------------------------------------------------------------


def _rgb_color(hex_color: str):
    from pptx.dml.color import RGBColor

    clean = hex_color.lstrip("#")
    return RGBColor(int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16))


def _set_background(slide, color: str) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = _rgb_color(color)


def _text_run(paragraph, text: str, font_size, color: str, *, bold: bool = False, italic: bool = False) -> None:
    paragraph.clear()
    run = paragraph.add_run()
    run.text = text or ""
    run.font.size = font_size
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = _rgb_color(color)


# ---------------------------------------------------------------------------
# Asset embedding (cid:primary -> picture shape)
# ---------------------------------------------------------------------------


def _resolve_image_asset(ref: str, assets: dict | None) -> dict | None:
    if not assets or not isinstance(assets, dict):
        return None
    images = assets.get("images") or []
    if not images:
        return None
    if ref == "primary":
        return images[0] if isinstance(images[0], dict) else None
    return next(
        (i for i in images if isinstance(i, dict) and i.get("name") == ref),
        None,
    )


def _embed_image(slide, img_data: dict, left, top, width, height) -> None:
    media_type = img_data.get("media_type", "image/jpeg")
    raw = base64.b64decode(img_data["data_b64"])
    img_stream = BytesIO(raw)
    slide.shapes.add_picture(img_stream, left, top, width, height)


# ---------------------------------------------------------------------------
# Native chart (still consumed from metadata.chart, not from html)
# ---------------------------------------------------------------------------


def _add_bar_chart(slide, chart_data: dict, theme: dict, left, top, width, height) -> bool:
    from pptx.chart.data import ChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Pt

    data_points = chart_data.get("data") or []
    if len(data_points) < 2:
        return False

    chart_data_obj = ChartData()
    chart_data_obj.categories = [str(p.get("label", "")) for p in data_points]
    chart_data_obj.add_series("", [float(p.get("value", 0)) for p in data_points])

    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        left, top, width, height,
        chart_data_obj,
    ).chart

    chart.has_legend = False
    chart.has_title = bool(chart_data.get("title"))
    if chart.has_title:
        chart.chart_title.text_frame.text = chart_data["title"]
        try:
            run0 = chart.chart_title.text_frame.paragraphs[0].runs[0]
            run0.font.size = Pt(13)
            run0.font.color.rgb = _rgb_color(theme["text"])
        except (IndexError, AttributeError):
            pass

    plot = chart.plots[0]
    for series in plot.series:
        fill = series.format.fill
        fill.solid()
        fill.fore_color.rgb = _rgb_color(theme["accent"])

    try:
        chart.value_axis.has_major_gridlines = False
        chart.value_axis.tick_labels.font.size = Pt(10)
        chart.value_axis.tick_labels.font.color.rgb = _rgb_color(theme["text"])
        chart.category_axis.tick_labels.font.size = Pt(10)
        chart.category_axis.tick_labels.font.color.rgb = _rgb_color(theme["text"])
    except Exception:
        pass
    return True


# ---------------------------------------------------------------------------
# HTML -> structural blocks
# ---------------------------------------------------------------------------


def _parse_html_fragment(html: str):
    """Return an lxml element for the slide html or None if parsing fails."""
    if not isinstance(html, str) or not html.strip():
        return None
    try:
        return lxml_html.fragment_fromstring(html, create_parent="div")
    except Exception:  # pragma: no cover — sanitizer guarantees parseable html
        return None


def _has_class(el, cls: str) -> bool:
    return cls in (el.get("class") or "").split()


def _text_of(el) -> str:
    return strip_to_text(lxml_html.tostring(el, encoding="unicode"))


def _direct_children(el) -> list:
    return list(el)


def _extract_blocks(root) -> dict:
    """Walk the slide root and bucket interesting elements into a block dict."""
    blocks: dict[str, Any] = {
        "title": None,
        "subtitle": None,
        "bullets": [],            # list[(marker_text, body_text)]
        "stats": [],              # list[{value, label}]
        "columns": None,          # (left_items, right_items)
        "quote": None,            # (body, cite)
        "image_ref": None,
        "table": None,            # list[list[str]]
    }

    def walk(node):
        for child in _direct_children(node):
            tag = (child.tag or "").lower()
            cls = child.get("class") or ""

            if tag in ("h1", "h2") and blocks["title"] is None and "slide-title" in cls:
                blocks["title"] = _text_of(child)
                continue
            if tag == "p" and "slide-subtitle" in cls and blocks["subtitle"] is None:
                blocks["subtitle"] = _text_of(child)
                continue

            if tag == "ul" and "slide-bullets" in cls:
                bullets = []
                for li in child.findall("li"):
                    marker_el = li.find('.//span[@class="slide-bullet-marker"]')
                    text_el = li.find('.//span[@class="slide-bullet-text"]')
                    marker = _text_of(marker_el) if marker_el is not None else ""
                    body = _text_of(text_el) if text_el is not None else _text_of(li)
                    if body:
                        bullets.append((marker, body))
                blocks["bullets"].extend(bullets)
                continue

            if tag == "ul" and "slide-stats" in cls:
                stats = []
                for li in child.findall("li"):
                    val_el = li.find('.//span[@class="slide-stat-value"]')
                    lbl_el = li.find('.//span[@class="slide-stat-label"]')
                    stats.append({
                        "value": _text_of(val_el) if val_el is not None else "",
                        "label": _text_of(lbl_el) if lbl_el is not None else "",
                    })
                blocks["stats"].extend(stats)
                continue

            if tag == "div" and "slide-columns" in cls:
                left_items, right_items = [], []
                for col in child.findall("div"):
                    col_cls = col.get("class") or ""
                    items = []
                    ul = col.find("ul")
                    if ul is not None:
                        for li in ul.findall("li"):
                            txt = _text_of(li)
                            if txt:
                                items.append(txt)
                    if "slide-column-left" in col_cls:
                        left_items = items
                    elif "slide-column-right" in col_cls:
                        right_items = items
                    elif not left_items:
                        left_items = items
                    else:
                        right_items = items
                blocks["columns"] = (left_items, right_items)
                continue

            if tag == "blockquote" and "slide-quote" in cls:
                body_el = child.find("p")
                cite_el = child.find("cite")
                blocks["quote"] = (
                    _text_of(body_el) if body_el is not None else _text_of(child),
                    _text_of(cite_el) if cite_el is not None else "",
                )
                continue

            if tag == "figure" and "slide-image" in cls:
                img = child.find("img")
                if img is not None:
                    src = img.get("src") or ""
                    if src.startswith("cid:"):
                        blocks["image_ref"] = src[4:]
                continue

            if tag == "table":
                rows = []
                for tr in child.iter("tr"):
                    cells = [_text_of(td) for td in tr]
                    if cells:
                        rows.append(cells)
                if rows:
                    blocks["table"] = rows
                continue

            if tag == "header":
                walk(child)
                continue

            if tag in ("ul", "ol"):
                # Generic bullet list outside the canonical class — fold into bullets.
                for li in child.findall("li"):
                    txt = _text_of(li)
                    if txt:
                        blocks["bullets"].append(("", txt))
                continue

            if tag == "p" and not blocks["subtitle"]:
                txt = _text_of(child)
                if txt:
                    blocks["subtitle"] = txt
                continue

            walk(child)

    walk(root)
    return blocks


# ---------------------------------------------------------------------------
# Renderers per layout
# ---------------------------------------------------------------------------


def _add_watermark(slide) -> None:
    from pptx.util import Inches, Pt

    box = slide.shapes.add_textbox(Inches(11.35), Inches(7.05), Inches(1.65), Inches(0.25))
    paragraph = box.text_frame.paragraphs[0]
    paragraph.alignment = 2
    _text_run(paragraph, "slidegen.ru", Pt(10), "9CA3AF")


def _add_icon_box(slide, icon_text: str) -> None:
    from pptx.util import Inches, Pt

    box = slide.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(0.75), Inches(0.55))
    tf = box.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = icon_text
    run.font.size = Pt(24)


def _render_title_slide(slide, blocks: dict, theme: dict, *, image_data: dict | None) -> None:
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    title = blocks.get("title") or ""
    subtitle = blocks.get("subtitle") or ""

    title_box = slide.shapes.add_textbox(Inches(1.1), Inches(2.35), Inches(11.1), Inches(1.1))
    tp = title_box.text_frame.paragraphs[0]
    tp.alignment = PP_ALIGN.CENTER
    _text_run(tp, title or "Untitled", Pt(42), theme["text"], bold=True)

    if subtitle:
        sub_box = slide.shapes.add_textbox(Inches(2), Inches(3.65), Inches(9.33), Inches(0.7))
        sp = sub_box.text_frame.paragraphs[0]
        sp.alignment = PP_ALIGN.CENTER
        _text_run(sp, subtitle, Pt(20), theme["accent"])

    if image_data:
        try:
            _embed_image(slide, image_data, Inches(9.8), Inches(1.8), Inches(3.0), Inches(3.0))
        except Exception:
            logger.warning("export.pptx title image embed failed")


def _render_quote_slide(slide, blocks: dict, theme: dict) -> None:
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    body, cite = blocks.get("quote") or ("", "")
    title = blocks.get("title") or ""
    box = slide.shapes.add_textbox(Inches(1.5), Inches(2.5), Inches(10.3), Inches(2.5))
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.LEFT
    _text_run(p, body or title or "", Pt(28), theme["text"], italic=True)
    if cite:
        cp = tf.add_paragraph()
        cp.alignment = PP_ALIGN.LEFT
        cp.space_before = Pt(12)
        _text_run(cp, f"— {cite}", Pt(14), theme["accent"])


def _render_two_column_slide(slide, blocks: dict, theme: dict) -> None:
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    title = blocks.get("title") or "Untitled"
    title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), Inches(11.85), Inches(0.75))
    tp = title_box.text_frame.paragraphs[0]
    tp.alignment = PP_ALIGN.LEFT
    _text_run(tp, title, Pt(28), theme["text"], bold=True)

    left, right = blocks.get("columns") or ([], [])
    for items, left_in, top_in, width_in in (
        (left, 0.85, 1.65, 5.7),
        (right, 6.95, 1.65, 5.7),
    ):
        box = slide.shapes.add_textbox(Inches(left_in), Inches(top_in), Inches(width_in), Inches(4.9))
        tf = box.text_frame
        tf.word_wrap = True
        if not items:
            items = [""]
        for i, text in enumerate(items):
            paragraph = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            paragraph.level = 0
            paragraph.space_after = Pt(8)
            _text_run(paragraph, text, Pt(16), theme["text"])


def _render_stats_slide(slide, blocks: dict, theme: dict, *, chart_data: dict | None, image_data: dict | None) -> None:
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    title = blocks.get("title") or "Untitled"
    title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), Inches(11.85), Inches(0.75))
    tp = title_box.text_frame.paragraphs[0]
    tp.alignment = PP_ALIGN.LEFT
    _text_run(tp, title, Pt(28), theme["text"], bold=True)

    if chart_data:
        try:
            ok = _add_bar_chart(slide, chart_data, theme, Inches(0.85), Inches(1.7), Inches(11.6), Inches(5.2))
            if ok:
                return
        except Exception:
            logger.warning("export.pptx native chart failed; falling back to stats text")

    stats = blocks.get("stats") or []
    if stats:
        cols = min(len(stats), 4) or 1
        col_width = (12.0) / cols
        for i, stat in enumerate(stats[:cols]):
            left = Inches(0.85 + i * col_width)
            value_box = slide.shapes.add_textbox(left, Inches(2.2), Inches(col_width - 0.2), Inches(1.8))
            vp = value_box.text_frame.paragraphs[0]
            vp.alignment = PP_ALIGN.LEFT
            _text_run(vp, str(stat.get("value", "")), Pt(48), theme["text"], bold=True)
            label_box = slide.shapes.add_textbox(left, Inches(4.0), Inches(col_width - 0.2), Inches(1.0))
            lp = label_box.text_frame.paragraphs[0]
            lp.alignment = PP_ALIGN.LEFT
            _text_run(lp, str(stat.get("label", "")), Pt(14), theme["accent"])
        return

    if image_data:
        try:
            _embed_image(slide, image_data, Inches(7.1), Inches(1.7), Inches(5.5), Inches(5.0))
        except Exception:
            logger.warning("export.pptx stats image embed failed")


def _render_content_slide(slide, blocks: dict, theme: dict, *, chart_data: dict | None, image_data: dict | None) -> None:
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    title = blocks.get("title") or "Untitled"
    bullets = [b for _, b in blocks.get("bullets") or []]
    has_chart = bool(chart_data)
    has_image = image_data is not None

    if has_chart or has_image:
        text_width = Inches(6.5)
        title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), text_width, Inches(0.75))
        tp = title_box.text_frame.paragraphs[0]
        tp.alignment = PP_ALIGN.LEFT
        _text_run(tp, title, Pt(28), theme["text"], bold=True)

        bullet_box = slide.shapes.add_textbox(Inches(1.05), Inches(1.65), Inches(5.8), Inches(4.9))
        tf = bullet_box.text_frame
        tf.word_wrap = True
        if not bullets:
            bullets = [""]
        for i, text in enumerate(bullets):
            paragraph = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            paragraph.space_after = Pt(8)
            _text_run(paragraph, text, Pt(18), theme["text"])

        if has_chart:
            try:
                _add_bar_chart(slide, chart_data, theme, Inches(7.0), Inches(0.5), Inches(5.8), Inches(5.8))
            except Exception:
                logger.warning("export.pptx content chart failed")
        elif has_image:
            try:
                _embed_image(slide, image_data, Inches(7.1), Inches(0.8), Inches(5.5), Inches(5.5))
            except Exception:
                logger.warning("export.pptx content image embed failed")
    else:
        title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), Inches(11.85), Inches(0.75))
        tp = title_box.text_frame.paragraphs[0]
        tp.alignment = PP_ALIGN.LEFT
        _text_run(tp, title, Pt(30), theme["text"], bold=True)

        bullet_box = slide.shapes.add_textbox(Inches(1.05), Inches(1.65), Inches(11.1), Inches(4.9))
        tf = bullet_box.text_frame
        tf.word_wrap = True
        if not bullets:
            bullets = [""]
        for i, text in enumerate(bullets):
            paragraph = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
            paragraph.space_after = Pt(8)
            _text_run(paragraph, text, Pt(21), theme["text"])


def _render_fallback(slide, html: str, theme: dict) -> None:
    """Last-resort: drop all sanitized text into one textbox so nothing is silently lost."""
    from pptx.util import Inches, Pt

    text = strip_to_text(html, max_len=2000) or "Slide"
    box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), Inches(11.85), Inches(6.4))
    tf = box.text_frame
    tf.word_wrap = True
    _text_run(tf.paragraphs[0], text, Pt(18), theme["text"])
    logger.warning("export.pptx fallback used (unrecognized layout)")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def _slide_image(slide_dict: dict, blocks: dict, presentation_assets: dict | None) -> dict | None:
    md = slide_dict.get("metadata") or {}
    ref = md.get("image_ref") or blocks.get("image_ref")
    if not ref:
        return None
    return _resolve_image_asset(ref, presentation_assets)


def _slide_chart(slide_dict: dict) -> dict | None:
    md = slide_dict.get("metadata") or {}
    chart = md.get("chart")
    if not isinstance(chart, dict):
        return None
    if chart.get("type") != "bar":
        return None
    if not isinstance(chart.get("data"), list) or len(chart["data"]) < 2:
        return None
    return chart


def generate_pptx(presentation_data: dict, watermark: bool = False) -> bytes:
    """Generate a widescreen PPTX file from canonical HTML slides and return bytes."""
    from pptx import Presentation as PPTXPresentation
    from pptx.util import Inches

    started = time.monotonic()
    pptx = PPTXPresentation()
    pptx.slide_width = Inches(13.33)
    pptx.slide_height = Inches(7.5)

    theme = resolve_export_theme(
        presentation_data
        if isinstance(presentation_data, dict)
        else {"theme": presentation_data}
    )
    blank_layout = pptx.slide_layouts[6]
    raw_slides: Iterable[Any] = presentation_data.get("slides") or []
    assets = presentation_data.get("assets") or {}

    slide_count = 0
    fallback_count = 0
    if not raw_slides:
        raw_slides = [{
            "html": (
                "<section class=\"slide slide-title\" data-layout=\"title\""
                " data-format=\"html_v1\">"
                f"<header class=\"slide-header\"><h1 class=\"slide-title\">"
                f"{presentation_data.get('title', 'Untitled')}</h1></header></section>"
            ),
            "metadata": {"layout": "title", "title": presentation_data.get("title", "Untitled")},
        }]

    for slide_dict in raw_slides:
        coerced = coerce_html_slide(slide_dict)
        slide = pptx.slides.add_slide(blank_layout)
        _set_background(slide, theme["bg"])

        layout = (coerced.get("metadata", {}) or {}).get("layout") or "content"
        icon = (coerced.get("metadata", {}) or {}).get("icon") or ""
        if icon:
            try:
                _add_icon_box(slide, icon)
            except Exception:
                pass

        root = _parse_html_fragment(coerced.get("html", ""))
        if root is None:
            _render_fallback(slide, coerced.get("html", ""), theme)
            fallback_count += 1
        else:
            blocks = _extract_blocks(root)
            chart_data = _slide_chart(coerced)
            image_data = _slide_image(coerced, blocks, assets)
            try:
                if layout == "title":
                    _render_title_slide(slide, blocks, theme, image_data=image_data)
                elif layout == "quote":
                    _render_quote_slide(slide, blocks, theme)
                elif layout == "two_column":
                    _render_two_column_slide(slide, blocks, theme)
                elif layout == "stats":
                    _render_stats_slide(slide, blocks, theme, chart_data=chart_data, image_data=image_data)
                elif layout == "cta":
                    _render_content_slide(slide, blocks, theme, chart_data=None, image_data=image_data)
                else:
                    _render_content_slide(slide, blocks, theme, chart_data=chart_data, image_data=image_data)
            except Exception:
                logger.exception("export.pptx layout=%s renderer crashed; using fallback", layout)
                _render_fallback(slide, coerced.get("html", ""), theme)
                fallback_count += 1

        if watermark:
            _add_watermark(slide)
        slide_count += 1

    output = BytesIO()
    pptx.save(output)
    duration_ms = int((time.monotonic() - started) * 1000)
    logger.info(
        "export.pptx rendered slides=%d fallbacks=%d duration_ms=%d",
        slide_count,
        fallback_count,
        duration_ms,
    )
    return output.getvalue()
