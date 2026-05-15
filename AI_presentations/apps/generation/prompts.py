"""Prompts and contracts for generating slide decks as canonical HTML.

The output contract is a JSON wrapper with html slide fragments. We keep JSON
as the transport because it is the most reliable way to make the model emit
exactly N items in order; the slide *content* is HTML — and the HTML is
intentionally permissive so the model can produce rich, designer-grade slides
(grids, infographics, SVG, callouts, timelines) instead of a fixed template.
"""

import json


# JSON-Schema describing the response wrapper. The schema is permissive on
# purpose: ``layout`` is a free-form hint (not an enum), ``chart`` accepts the
# common types, and titles can be longer for descriptive headlines.
PRESENTATION_HTML_SCHEMA = {
    "type": "object",
    "required": ["title", "slides"],
    "additionalProperties": True,
    "properties": {
        "title": {"type": "string", "minLength": 1, "maxLength": 160},
        "subtitle": {"type": "string"},
        "slides": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["html"],
                "additionalProperties": True,
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
                        "additionalProperties": True,
                        "properties": {
                            "layout": {
                                "type": "string",
                                "description": (
                                    "Free-form layout hint. Common values: title, content,"
                                    " two_column, three_column, grid, quote, stats, cta,"
                                    " timeline, comparison, hero, infographic, callout."
                                    " Pick whatever best describes the slide; renderers"
                                    " gracefully fall back when they don't recognise a value."
                                ),
                            },
                            "title": {"type": "string", "minLength": 1, "maxLength": 160},
                            "icon": {"type": "string", "maxLength": 8},
                            "image_ref": {"type": ["string", "null"]},
                            "notes": {"type": "string", "maxLength": 1200},
                            "chart": {
                                "type": "object",
                                "required": ["type", "data"],
                                "properties": {
                                    "type": {
                                        "type": "string",
                                        "enum": [
                                            "bar",
                                            "column",
                                            "line",
                                            "area",
                                            "pie",
                                            "doughnut",
                                            "radar",
                                        ],
                                    },
                                    "title": {"type": "string"},
                                    "data": {
                                        "type": "array",
                                        "minItems": 2,
                                        "maxItems": 16,
                                        "items": {
                                            "type": "object",
                                            "required": ["label", "value"],
                                            "properties": {
                                                "label": {"type": "string", "maxLength": 32},
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
    "HTML CONTRACT (creative freedom inside a safe sandbox):\n"
    "0. DESIGN CANVAS: every slide is rendered inside a 1200×675 px (16:9) frame."
    " The viewer auto-scales uniformly to other display sizes, so design once at"
    " this exact size. ALL content of the root <section> MUST visually fit"
    " within 1200×675 at the sizes you choose. Treat these as hard bounds:\n"
    "   • Total section height ≤ 675px — do NOT use min-height larger than 640px.\n"
    "   • Hero/title font-size ≤ 96px (use 64-88px for most title slides). For"
    " non-title h1/h2, use 28-44px. Body text 14-22px. Captions 11-13px.\n"
    "   • Section padding ≤ 64px on any side; prefer 40-56px.\n"
    "   • For absolutely-positioned chrome (header/footer rows), keep ≥ 24px of"
    " safe margin from each edge so nothing clips when the viewer adds its own"
    " page-counter/watermark overlay near the corners.\n"
    "   • If content cannot fit, REDUCE word count or split across two slides —"
    " never let text spill past the design canvas.\n"
    "1. Each slide is wrapped in ONE root <section class=\"slide slide-{layout}\""
    " data-layout=\"{layout}\" data-format=\"html_v1\">…</section>. The {layout}"
    " value is your choice — use any descriptive token that matches the slide.\n"
    "2. Inside the section you have full freedom: any combination of header,"
    " footer, h1-h6, p, ul/ol/li, dl/dt/dd, blockquote/cite/q, table, figure,"
    " figcaption, img, picture, details/summary, progress/meter, time, mark,"
    " hr, span, div, article, aside, nav. Use semantic tags whenever they fit.\n"
    "3. Inline SVG is encouraged for custom infographics, charts, diagrams,"
    " timelines, icons, decorative shapes. Allowed SVG elements: svg, g, defs,"
    " use, symbol, path, circle, ellipse, rect, line, polyline, polygon, text,"
    " tspan, linearGradient, radialGradient, stop, clipPath, mask, pattern,"
    " marker, foreignObject, filter, feGaussianBlur, feOffset, feMerge,"
    " feMergeNode, feColorMatrix, feDropShadow, feBlend, feFlood, feComposite.\n"
    "4. Inline style is BROADLY ALLOWED for visual design: color, background,"
    " background-image (incl. linear-gradient/radial-gradient), padding, margin,"
    " border, border-radius, box-shadow, text-shadow, opacity, transform,"
    " filter, backdrop-filter, display (incl. grid/flex), grid-template-columns,"
    " grid-template-rows, grid-template-areas, grid-area, gap, flex,"
    " flex-direction, justify-content, align-items, position, top/right/bottom/left,"
    " width/height/min-*/max-*, aspect-ratio, font-*, line-height, letter-spacing,"
    " text-align, text-transform, mix-blend-mode, clip-path, object-fit. Prefer"
    " classes when the look is reusable; use inline styles freely otherwise.\n"
    "5. STRICTLY FORBIDDEN: <script>, <style>, <iframe>, <object>, <embed>,"
    " <form>, <input>, <link>, <meta>, on*-handlers (onclick, onload, onerror, …),"
    " javascript:/vbscript:/file: URLs. Stylesheet links are not available — put"
    " every visual choice inline or via the slide CSS classes.\n"
    "6. Images: <figure class=\"slide-image\"><img src=\"cid:primary\" alt=\"…\"/>"
    "</figure>. The cid:primary scheme references the uploaded source image."
    " You may also reference data:image/(png|jpg|jpeg|gif|webp|svg+xml);base64,…\n"
    "7. Charts: when numbers tell the story, mirror them in metadata.chart so the"
    " PPTX exporter can render a native chart (type ∈ bar|column|line|area|pie|"
    "doughnut|radar). You may ALSO draw a richer SVG chart inside the html for"
    " the on-screen viewer; both can coexist.\n"
    "8. Recommended class hooks (themes style them when present): slide-title,"
    " slide-subtitle, slide-bullets, slide-bullet-marker, slide-bullet-text,"
    " slide-stats, slide-stat, slide-stat-value, slide-stat-label, slide-columns,"
    " slide-column, slide-quote, slide-image, slide-chart. Add your own classes"
    " freely for bespoke layouts.\n"
    "9. JSON envelope: never include markdown, comments, code fences, or prose"
    " outside the JSON object. Return ONE valid JSON object only.\n"
)


SYSTEM_PROMPT = (
    "You are Slidegen, a senior presentation architect and visual designer."
    " Produce slide decks that feel hand-crafted: information-dense, visually"
    " confident, structurally varied. Each slide should earn its place with a"
    " clear idea AND a deliberate visual treatment — not a wall of bullets."
    " Use the full range of HTML/CSS/SVG you have access to.\n\n"
    "Return exactly ONE JSON object that validates against the schema in the"
    " user prompt. Do NOT wrap the JSON in markdown, comments, code fences, or"
    " prose.\n\n"
    "DESIGN DIRECTION:\n"
    "- Vary structure across the deck. A 10-slide deck should use 5-8 different"
    " layouts: hero, two/three column, grid, timeline, stats with chart, quote,"
    " comparison table, callout, infographic, cta. Avoid the 'wall of bullets'"
    " template trap.\n"
    "- Use grids and flexbox to compose slides as designed pages, not stacked"
    " text. Multiple zones, sub-headers, accent colors, dividers, generous"
    " spacing — all welcome.\n"
    "- Inline SVG is the right tool for: process diagrams, simple maps,"
    " ratios/proportions, timelines, custom marker shapes, decorative accents."
    " Don't shy away from it.\n"
    "- Bullets are fine when they fit, but they are not the default. Prefer"
    " mini-cards, stat blocks, comparison rows, or annotated diagrams.\n"
    "- Density is good when meaningful. Don't pad with filler, but don't"
    " starve a slide either — a presentation slide that explains itself"
    " (so the audience can read on its own) is more valuable than a billboard"
    " with three words.\n"
    "- Use color, weight, and size to create visual hierarchy. Inline styles"
    " are allowed precisely so you can do this.\n\n"
    f"{HTML_CONTRACT_RULES}\n"
    "VISUAL ENRICHMENT:\n"
    "- For quantitative slides, populate metadata.chart so the PPTX exporter"
    " gets a real chart, AND optionally include an SVG visualization in the"
    " html for the on-screen viewer.\n"
    "- If a source image was provided, set image_ref=\"primary\" on EXACTLY one"
    " slide where the image fits best (insert <figure class=\"slide-image\">"
    " in its html). Use the image as a hero element, not a thumbnail.\n"
    "- Stats: still mirror 3-6 metrics inside <ul class=\"slide-stats\"> for"
    " the web preview when stats are the main story."
)


SINGLE_SLIDE_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor and designer. Edit"
    " exactly ONE slide according to the user's instruction. Return only one"
    " JSON object with fields {html, metadata}. Use the full HTML/CSS/SVG"
    " range allowed by the contract — when the instruction implies a visual"
    " change, deliver an actual visual change, not a rewording.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


NEW_SLIDE_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation architect. Create exactly ONE"
    " NEW slide that fits the existing deck context and the user's"
    " instruction. Match the deck's visual register but feel free to vary"
    " layout — the new slide should feel intentional, not duplicate. Return"
    " only one JSON object with fields {html, metadata}.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


DECK_ASSIST_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor. You receive the"
    " presentation title, an instruction, and the current slides as JSON"
    " (each slide is {html, metadata}). Return exactly ONE JSON object with"
    " keys title (string) and slides (array of {html, metadata}). You MUST"
    " keep the same number of slides in the same order as the input. Do not"
    " add, remove, or merge slides. Apply the user's instruction across the"
    " whole deck (tone, length, structure, language, clarity, visual"
    " richness). Each slide html must follow the HTML CONTRACT.\n\n"
    f"{HTML_CONTRACT_RULES}"
)


_VISUAL_FREEDOM = (
    "Visual freedom: treat each slide as a designed page, not a bullet list."
    " Mix layouts across the deck — hero, grid, timeline, comparison, stats"
    " with chart, quote, callout, infographic, cta. Use inline CSS grid/flex,"
    " gradients, colored accents, dividers, generous spacing. Reach for inline"
    " SVG for diagrams, timelines, ratios, custom icons. Density is welcome"
    " when it pays off; never pad with filler. The audience should be able to"
    " read the slide on its own and learn something."
)


STYLE_INSTRUCTIONS: dict[str, str] = {
    "pitch": (
        "Presentation style: PITCH DECK.\n"
        "Audience goal: investors / decision-makers leave convinced and curious.\n"
        "Tone: confident, narrative, visually punchy — every slide advances the story.\n"
        "Structure: build a clear arc (problem → insight → solution → proof → ask)."
        " Use a hero opener, a stats slide with a real chart, a contrast slide"
        " (before/after or us/them), a roadmap or timeline, and a strong cta.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Don't follow a template. Find the single most compelling narrative arc for this specific topic."
    ),
    "report": (
        "Presentation style: DETAILED REPORT.\n"
        "Audience goal: a reader with no presenter must fully understand the findings and act on them.\n"
        "Tone: formal, evidence-based, precise — back every claim with data, source, or reasoning.\n"
        "Structure: executive summary, methodology, findings (multiple slides with"
        " charts/tables), risks, recommendations, appendix. Slides should be"
        " self-contained — assume the reader is offline.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Use tables, comparison grids, multi-series charts, and annotated diagrams."
        " Write complete sentences where context demands it. Every slide must be self-explanatory."
    ),
    "lecture": (
        "Presentation style: EDUCATIONAL LECTURE.\n"
        "Audience goal: the audience leaves understanding a concept they didn't before.\n"
        "Tone: clear, pedagogical, engaging — build knowledge step by step.\n"
        "Structure: motivation, definitions, mechanism (with a diagram), examples"
        " (worked through visually), edge cases, recap. Use 'quote' slides for"
        " definitions/axioms; use SVG for mechanism diagrams.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Let the structure follow the learning arc, not a fixed template. Reward attention with visual anchors."
    ),
    "analytical": (
        "Presentation style: ANALYTICAL BRIEF.\n"
        "Audience goal: decision-makers leave with a clear recommendation and the reasoning behind it.\n"
        "Tone: analytical, action-oriented, factual — focus on decisions, not descriptions.\n"
        "Structure: question, options compared (two_column or comparison table),"
        " trade-offs, evidence (charts), recommendation, next steps. Include at"
        " least one comparison slide and one stats slide with a real chart.\n"
        f"{_VISUAL_FREEDOM}\n"
        "Use 'two_column'/'comparison' for trade-offs; use stats slides with charts to anchor decisions in numbers."
    ),
    "proposal": (
        "Presentation style: COMMERCIAL PROPOSAL.\n"
        "Audience goal: the client sees their own problem reflected, believes in the solution, and knows the next step.\n"
        "Tone: benefit-driven, persuasive, credible — speak to outcomes, not features.\n"
        "Structure: client's situation, their goal, our approach (with timeline),"
        " what they'll get (grid of deliverables), proof (case stats / quote),"
        " investment, next step. Personalise to the client wherever possible.\n"
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
        "alt=\"…\"/></figure> in that slide's html. Use it as a hero or anchor element, not a thumbnail."
        if has_image
        else "- No source image was uploaded. Do NOT set image_ref or include any <figure class=\"slide-image\">."
    )

    prompt_parts.extend(
        [
            "",
            "Hard requirements:",
            f"- Return exactly {slides_count} slides.",
            "- The first slide should function as the title/hero (metadata.layout = \"title\" recommended).",
            "- metadata.layout is a free-form hint — pick whatever describes the slide best (title, content,"
            " two_column, three_column, grid, quote, stats, cta, timeline, comparison, hero, infographic,"
            " callout, …). Vary layouts across the deck; don't reuse the same one mechanically.",
            "- Use bullets only when they're the right tool. Prefer cards, stat blocks, tables, or"
            " annotated diagrams when they communicate better. When you do use bullets, the marker block"
            " is <span class=\"slide-bullet-marker\" data-marker=\"true\">01</span>.",
            "- For quantitative content, populate metadata.chart (type ∈ bar|column|line|area|pie|"
            "doughnut|radar). You may ALSO draw a custom SVG chart inside the html.",
            "- Inline SVG is welcome for diagrams, timelines, infographics, and decorative accents.",
            "- Inline styles for layout (grid/flex/gradients/positioning) are allowed and encouraged.",
            image_rule,
            "- Do not include markdown, code fences, comments, or prose outside the JSON object.",
            "- Return only valid JSON matching this JSON Schema:",
            json.dumps(PRESENTATION_HTML_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )
    return "\n".join(prompt_parts)


# Back-compat re-export so any old import keeps working until cleanup.
PRESENTATION_JSON_SCHEMA = PRESENTATION_HTML_SCHEMA
