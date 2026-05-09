"""Prompts and contracts for generating slide decks as canonical HTML.

The output contract is a JSON wrapper with html slide fragments. We keep JSON
as the transport because it is the most reliable way to make the model emit
exactly N items in order; the slide *content* is HTML.
"""

import json


# JSON-Schema describing the response wrapper. Every slide carries a html
# fragment plus structured metadata (layout/icon/chart/...) — chart stays
# structured because the PPTX exporter renders it as a native chart.
PRESENTATION_HTML_SCHEMA = {
    "type": "object",
    "required": ["title", "slides"],
    "additionalProperties": False,
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 80},
        "slides": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["html", "metadata"],
                "additionalProperties": False,
                "properties": {
                    "html": {
                        "type": "string",
                        "minLength": 1,
                        "description": (
                            "Sanitized HTML fragment. Must start with"
                            " <section class=\"slide ...\" data-layout=\"...\""
                            " data-format=\"html_v1\"> and end with </section>."
                        ),
                    },
                    "metadata": {
                        "type": "object",
                        "required": ["layout", "title"],
                        "additionalProperties": False,
                        "properties": {
                            "layout": {
                                "type": "string",
                                "enum": [
                                    "title",
                                    "content",
                                    "two_column",
                                    "quote",
                                    "stats",
                                    "cta",
                                ],
                            },
                            "title": {"type": "string", "minLength": 1, "maxLength": 80},
                            "icon": {"type": "string", "maxLength": 8},
                            "image_ref": {"type": ["string", "null"]},
                            "notes": {"type": "string", "maxLength": 600},
                            "chart": {
                                "type": "object",
                                "required": ["type", "data"],
                                "properties": {
                                    "type": {"type": "string", "enum": ["bar"]},
                                    "title": {"type": "string"},
                                    "data": {
                                        "type": "array",
                                        "minItems": 2,
                                        "maxItems": 8,
                                        "items": {
                                            "type": "object",
                                            "required": ["label", "value"],
                                            "properties": {
                                                "label": {"type": "string", "maxLength": 12},
                                                "value": {"type": "number"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    },
}


HTML_CONTRACT_RULES = (
    "HTML CONTRACT (strict):\n"
    "1. Every slide html fragment must be ONE <section class=\"slide slide-{layout}\" "
    "   data-layout=\"{layout}\" data-format=\"html_v1\">…</section>. No other root element.\n"
    "2. Allowed tags ONLY: section, header, footer, h1, h2, h3, h4, p, ul, ol, li,\n"
    "   blockquote, cite, strong, em, b, i, u, small, mark, br, span, div, figure,\n"
    "   figcaption, img, table, thead, tbody, tfoot, tr, td, th, caption, code, pre,\n"
    "   kbd, abbr, hr.\n"
    "3. NEVER emit: script, style, iframe, object, embed, form, input, link, meta.\n"
    "4. NEVER emit on*-attributes (onclick, onload, ...), javascript:/vbscript: URLs,\n"
    "   or data: URLs other than data:image/(png|jpg|jpeg|gif|webp|svg+xml);base64,…\n"
    "5. CSS classes you MUST use for the canonical structure: slide, slide-title,\n"
    "   slide-subtitle, slide-bullets, slide-bullet-marker, slide-bullet-text,\n"
    "   slide-stats, slide-stat, slide-stat-value, slide-stat-label, slide-columns,\n"
    "   slide-column, slide-column-left, slide-column-right, slide-quote, slide-image,\n"
    "   slide-chart.\n"
    "6. Inline style attributes are allowed only for: color, background-color,\n"
    "   font-size, font-weight, font-style, text-align, text-decoration,\n"
    "   letter-spacing, line-height, padding, margin, width, height, max-width,\n"
    "   max-height, opacity, border, border-radius. Prefer classes over inline styles.\n"
    "7. Images go in <figure class=\"slide-image\"><img src=\"cid:primary\" alt=\"…\"/>"
    "   </figure>. Do NOT inline base64; use cid:primary for the uploaded source image.\n"
    "8. Charts are NOT inline graphics — emit them only via metadata.chart (the"
    "   exporter renders the real chart). Optionally mirror chart data in html as a\n"
    "   <ul class=\"slide-chart-bars\"> for the web preview.\n"
    "9. Bullet lists must use <ul class=\"slide-bullets\"><li><span class=\"slide-bullet-marker\""
    "   data-marker=\"true\">01</span><span class=\"slide-bullet-text\">…</span></li>…</ul>.\n"
    "10. Never include markdown, comments, code fences, or prose outside the JSON.\n"
)


SYSTEM_PROMPT = (
    "You are Slidegen, a senior presentation architect that emits canonical "
    "HTML slides. Return exactly ONE JSON object that validates against the "
    "schema in the user prompt. Do NOT wrap the JSON in markdown, comments, "
    "code fences, or prose. Use concise, presentation-ready copy; avoid "
    "filler, duplication, and generic claims. Each slide must have a clear "
    "purpose and a tight visual hierarchy.\n\n"
    f"{HTML_CONTRACT_RULES}\n"
    "VISUAL ENRICHMENT:\n"
    "- For 'stats' layouts with quantitative data, populate metadata.chart "
    "(type=bar, 2-8 points). Labels max 12 chars / 1-2 short words.\n"
    "- If a source image was provided, set image_ref=\"primary\" on EXACTLY one "
    "slide where the image fits best (insert <figure class=\"slide-image\"> in its html).\n"
    "- For 'stats' layouts populate metadata.chart when numbers tell the story; "
    "still mirror 2-4 metrics inside <ul class=\"slide-stats\"> for the web preview."
)


SINGLE_SLIDE_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor. Edit exactly ONE slide "
    "according to the user's instruction. Return only one JSON object with "
    "fields {html, metadata}. The html must follow the same HTML CONTRACT as "
    "the deck generator; metadata.layout must be one of "
    "title|content|two_column|quote|stats|cta.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


NEW_SLIDE_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation architect. Create exactly ONE "
    "NEW slide that fits the existing deck context and the user's instruction. "
    "Return only one JSON object with fields {html, metadata}. Follow the same "
    "HTML CONTRACT as the deck generator.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


DECK_ASSIST_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor. You receive the "
    "presentation title, an instruction, and the current slides as JSON "
    "(each slide is {html, metadata}). Return exactly ONE JSON object with "
    "keys title (string) and slides (array of {html, metadata}). You MUST "
    "keep the same number of slides in the same order as the input. Do not "
    "add, remove, or merge slides. Apply the user's instruction across the "
    "whole deck (tone, length, structure, language, clarity). Each slide html "
    "must follow the HTML CONTRACT.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


_VISUAL_FREEDOM = (
    "Visual freedom: look for every opportunity to show instead of tell — "
    "turn a comparison into a 'two_column' slide, a claim into a 'stats' "
    "slide with a chart, a turning point or key idea into a 'quote', a call "
    "to action into 'cta'. Use as few words as possible. Prefer zero bullets "
    "if a visual layout communicates better."
)


STYLE_INSTRUCTIONS: dict[str, str] = {
    "pitch": (
        "Presentation style: MINIMALIST.\n"
        "Audience goal: make them lean forward, feel the idea, want to know more.\n"
        "Tone: confident, surprising, visual — each slide earns its place.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Do not follow a template. Find the single most compelling narrative arc for this specific topic."
    ),
    "report": (
        "Presentation style: DETAILED REPORT.\n"
        "Audience goal: a reader with no presenter must fully understand the findings and act on them.\n"
        "Tone: formal, evidence-based, precise — back every claim with data or reasoning.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Write complete sentences where needed. Every slide must be self-explanatory."
    ),
    "lecture": (
        "Presentation style: EDUCATIONAL.\n"
        "Audience goal: the audience leaves understanding a concept they didn't before.\n"
        "Tone: clear, pedagogical, engaging — build knowledge step by step.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Use 'quote' for definitions and axioms. Let the structure follow the learning arc, not a fixed template."
    ),
    "analytical": (
        "Presentation style: ANALYTICAL BRIEF.\n"
        "Audience goal: decision-makers leave with a clear recommendation and the reasoning behind it.\n"
        "Tone: analytical, action-oriented, factual — focus on decisions, not descriptions.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Use 'two_column' for trade-offs and comparisons. Let the data drive the structure."
    ),
    "proposal": (
        "Presentation style: COMMERCIAL PROPOSAL.\n"
        "Audience goal: the client sees their own problem reflected, believes in the solution, and knows the next step.\n"
        "Tone: benefit-driven, persuasive, credible — speak to goals, not features.\n"
        f"{_VISUAL_FREEDOM}\n"
        "End with a strong 'cta' slide. Let the client's pain shape the narrative, not a sales template."
    ),
}

KNOWN_STYLES = frozenset(STYLE_INSTRUCTIONS.keys())


def build_prompt(
    topic,
    context="",
    audience="",
    slides_count=8,
    tone="",
    language="Russian",
    has_image=False,
    style="pitch",
) -> str:
    """Build the user prompt for generating a structured HTML slide deck."""
    prompt_parts = [
        f"Topic: {topic}",
        f"Language: {language}",
        f"Slides count: {slides_count}",
    ]
    if context:
        prompt_parts.append(f"Context: {context}")
    if audience:
        prompt_parts.append(f"Audience: {audience}")
    if tone:
        prompt_parts.append(f"Tone: {tone}")

    style_key = style if style in KNOWN_STYLES else "pitch"
    prompt_parts.extend(["", STYLE_INSTRUCTIONS[style_key]])

    image_rule = (
        "- A source image WAS uploaded. Set metadata.image_ref=\"primary\" on exactly one slide "
        "where it fits best, and include <figure class=\"slide-image\"><img src=\"cid:primary\" "
        "alt=\"…\"/></figure> in that slide's html."
        if has_image
        else "- No source image was uploaded. Do NOT set image_ref or include any <figure class=\"slide-image\">."
    )

    prompt_parts.extend(
        [
            "",
            "Hard requirements:",
            f"- Return exactly {slides_count} slides.",
            "- Allowed metadata.layout values: title, content, two_column, quote, stats, cta.",
            "- The first slide must have metadata.layout == \"title\".",
            "- Keep every metadata.title under 80 characters.",
            "- Bullets per slide: as few as the content demands; max 5, each under 120 characters.",
            "- Add metadata.chart on stats slides when quantitative data is present.",
            image_rule,
            "- Do not include markdown, code fences, comments, or prose outside the JSON object.",
            "- Return only valid JSON matching this JSON Schema:",
            json.dumps(PRESENTATION_HTML_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )
    return "\n".join(prompt_parts)


# Back-compat re-export so any old import keeps working until cleanup.
PRESENTATION_JSON_SCHEMA = PRESENTATION_HTML_SCHEMA
