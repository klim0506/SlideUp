import base64
from io import BytesIO

from apps.presentations.themes import resolve_export_theme


def _rgb_color(hex_color):
    """Convert a six-character hex color string into a python-pptx RGBColor."""
    from pptx.dml.color import RGBColor

    clean = hex_color.lstrip("#")
    return RGBColor(int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16))


def _set_background(slide, color):
    """Apply a solid background color to a PowerPoint slide."""
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = _rgb_color(color)


def _text_frame(paragraph, text, font_size, color, bold=False):
    """Populate a paragraph with formatted text."""
    paragraph.clear()
    run = paragraph.add_run()
    run.text = text
    run.font.size = font_size
    run.font.bold = bold
    run.font.color.rgb = _rgb_color(color)
    return paragraph


def _extract_bullets(slide_data):
    """Extract a bullet list from a slide dictionary using common content shapes."""
    bullets = slide_data.get("bullets")
    if isinstance(bullets, list):
        return [str(item) for item in bullets if isinstance(item, str)]

    content = slide_data.get("content")
    if isinstance(content, list):
        return [str(item) for item in content if isinstance(item, str)]
    if isinstance(content, dict):
        content_bullets = content.get("bullets") or content.get("items")
        if isinstance(content_bullets, list):
            return [str(item) for item in content_bullets if isinstance(item, str)]
    if isinstance(content, str):
        return [content]
    return []


def _add_watermark(slide, theme):
    """Add the slidegen.ru watermark to the bottom-right corner of a slide."""
    from pptx.util import Inches, Pt

    box = slide.shapes.add_textbox(Inches(11.35), Inches(7.05), Inches(1.65), Inches(0.25))
    paragraph = box.text_frame.paragraphs[0]
    paragraph.alignment = 2
    _text_frame(paragraph, "slidegen.ru", Pt(10), "9CA3AF")


def _add_icon_box(slide, icon_text, theme):
    """Add an emoji icon in the top-left corner of the slide."""
    from pptx.util import Inches, Pt

    box = slide.shapes.add_textbox(Inches(0.4), Inches(0.15), Inches(0.75), Inches(0.55))
    tf = box.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    run = p.add_run()
    run.text = icon_text
    run.font.size = Pt(24)


def _add_bar_chart(slide, chart_data, theme, left, top, width, height):
    """Add a bar chart to the slide using python-pptx native chart support."""
    from pptx.chart.data import ChartData
    from pptx.enum.chart import XL_CHART_TYPE
    from pptx.util import Pt

    data_points = chart_data.get("data", [])
    if len(data_points) < 2:
        return

    chart_data_obj = ChartData()
    chart_data_obj.categories = [p["label"] for p in data_points]
    chart_data_obj.add_series("", [p["value"] for p in data_points])

    chart = slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED,
        left, top, width, height,
        chart_data_obj,
    ).chart

    chart.has_legend = False
    chart.has_title = bool(chart_data.get("title"))
    if chart.has_title:
        chart.chart_title.text_frame.text = chart_data["title"]
        chart.chart_title.text_frame.paragraphs[0].runs[0].font.size = Pt(13)
        chart.chart_title.text_frame.paragraphs[0].runs[0].font.color.rgb = _rgb_color(theme["text"])

    plot = chart.plots[0]
    for series in plot.series:
        fill = series.format.fill
        fill.solid()
        fill.fore_color.rgb = _rgb_color(theme["accent"])

    value_axis = chart.value_axis
    value_axis.has_major_gridlines = False
    try:
        value_axis.tick_labels.font.size = Pt(10)
        value_axis.tick_labels.font.color.rgb = _rgb_color(theme["text"])
    except Exception:
        pass

    cat_axis = chart.category_axis
    try:
        cat_axis.tick_labels.font.size = Pt(10)
        cat_axis.tick_labels.font.color.rgb = _rgb_color(theme["text"])
    except Exception:
        pass


def _embed_image(slide, img_data, left, top, width, height):
    """Embed a base64-encoded image onto the slide."""
    media_type = img_data.get("media_type", "image/jpeg")
    ext_map = {
        "image/jpeg": "jpg",
        "image/png": "png",
        "image/gif": "gif",
        "image/webp": "webp",
    }
    ext = ext_map.get(media_type, "jpg")
    raw = base64.b64decode(img_data["data_b64"])
    img_stream = BytesIO(raw)
    slide.shapes.add_picture(img_stream, left, top, width, height)


def _add_title_slide(slide, slide_data, theme, watermark, image_source=None):
    """Render a title slide with a large centered title and optional subtitle."""
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    _set_background(slide, theme["bg"])

    icon = slide_data.get("icon", "")
    if icon:
        _add_icon_box(slide, icon, theme)

    title_box = slide.shapes.add_textbox(Inches(1.1), Inches(2.35), Inches(11.1), Inches(1.1))
    title_frame = title_box.text_frame
    title_frame.word_wrap = True
    title_paragraph = title_frame.paragraphs[0]
    title_paragraph.alignment = PP_ALIGN.CENTER
    _text_frame(
        title_paragraph,
        str(slide_data.get("title") or "Untitled"),
        Pt(42),
        theme["text"],
        bold=True,
    )

    subtitle = slide_data.get("subtitle") or slide_data.get("content") or ""
    if isinstance(subtitle, dict):
        subtitle = subtitle.get("subtitle") or subtitle.get("text") or ""
    if subtitle:
        subtitle_box = slide.shapes.add_textbox(Inches(2), Inches(3.65), Inches(9.33), Inches(0.7))
        subtitle_paragraph = subtitle_box.text_frame.paragraphs[0]
        subtitle_paragraph.alignment = PP_ALIGN.CENTER
        _text_frame(subtitle_paragraph, str(subtitle), Pt(20), theme["accent"])

    if image_source:
        try:
            _embed_image(slide, image_source, Inches(9.8), Inches(1.8), Inches(3.0), Inches(3.0))
        except Exception:
            pass

    if watermark:
        _add_watermark(slide, theme)


def _add_content_slide(slide, slide_data, theme, watermark, image_source=None):
    """Render a content slide with heading, bullets, optional chart and image."""
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Inches, Pt

    _set_background(slide, theme["bg"])

    icon = slide_data.get("icon", "")
    if icon:
        _add_icon_box(slide, icon, theme)

    chart_data = slide_data.get("chart")
    has_chart = isinstance(chart_data, dict) and len(chart_data.get("data", [])) >= 2
    has_image = image_source is not None

    # With chart or image: narrow text column (left), visual on right
    if has_chart or has_image:
        text_width = Inches(6.5)
        title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), text_width, Inches(0.75))
        title_paragraph = title_box.text_frame.paragraphs[0]
        title_paragraph.alignment = PP_ALIGN.LEFT
        _text_frame(title_paragraph, str(slide_data.get("title") or "Untitled"), Pt(28), theme["text"], bold=True)

        bullets = _extract_bullets(slide_data)
        bullet_box = slide.shapes.add_textbox(Inches(1.05), Inches(1.65), Inches(5.8), Inches(4.9))
        text_frame = bullet_box.text_frame
        text_frame.word_wrap = True
        if not bullets:
            bullets = [""]
        for index, bullet in enumerate(bullets):
            paragraph = text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
            paragraph.level = 0
            paragraph.space_after = Pt(8)
            _text_frame(paragraph, bullet, Pt(18), theme["text"])

        if has_chart:
            try:
                _add_bar_chart(slide, chart_data, theme, Inches(7.0), Inches(0.5), Inches(5.8), Inches(5.8))
            except Exception:
                pass
        elif has_image:
            try:
                _embed_image(slide, image_source, Inches(7.1), Inches(0.8), Inches(5.5), Inches(5.5))
            except Exception:
                pass
    else:
        # Standard full-width layout
        title_box = slide.shapes.add_textbox(Inches(0.75), Inches(0.55), Inches(11.85), Inches(0.75))
        title_paragraph = title_box.text_frame.paragraphs[0]
        title_paragraph.alignment = PP_ALIGN.LEFT
        _text_frame(title_paragraph, str(slide_data.get("title") or "Untitled"), Pt(30), theme["text"], bold=True)

        bullets = _extract_bullets(slide_data)
        bullet_box = slide.shapes.add_textbox(Inches(1.05), Inches(1.65), Inches(11.1), Inches(4.9))
        text_frame = bullet_box.text_frame
        text_frame.word_wrap = True
        if not bullets:
            bullets = [""]
        for index, bullet in enumerate(bullets):
            paragraph = text_frame.paragraphs[0] if index == 0 else text_frame.add_paragraph()
            paragraph.level = 0
            paragraph.space_after = Pt(8)
            _text_frame(paragraph, bullet, Pt(21), theme["text"])

    if watermark:
        _add_watermark(slide, theme)


def generate_pptx(presentation_data: dict, watermark: bool = False) -> bytes:
    """Generate a widescreen PPTX file from presentation data and return it as bytes."""
    from pptx import Presentation
    from pptx.util import Inches

    pptx = Presentation()
    pptx.slide_width = Inches(13.33)
    pptx.slide_height = Inches(7.5)

    theme = resolve_export_theme(presentation_data if isinstance(presentation_data, dict) else {"theme": presentation_data})
    blank_layout = pptx.slide_layouts[6]
    slides = presentation_data.get("slides") or []

    # Resolve the single image asset (if any)
    assets = presentation_data.get("assets") or {}
    images = assets.get("images") or []
    image_source = images[0] if images else None

    if not slides:
        slides = [{"type": "title", "title": presentation_data.get("title", "Untitled")}]

    for slide_data in slides:
        slide = pptx.slides.add_slide(blank_layout)
        # Find the image for this slide if it has image=True
        slide_image = image_source if (slide_data.get("image") is True and image_source) else None
        if slide_data.get("type") == "title":
            _add_title_slide(slide, slide_data, theme, watermark, image_source=slide_image)
        else:
            _add_content_slide(slide, slide_data, theme, watermark, image_source=slide_image)

    output = BytesIO()
    pptx.save(output)
    return output.getvalue()
