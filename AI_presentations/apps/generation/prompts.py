import json


PRESENTATION_JSON_SCHEMA = {
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
                "required": ["type", "title", "bullets", "content"],
                "additionalProperties": True,
                "properties": {
                    "type": {
                        "type": "string",
                        "enum": ["title", "content", "two_column", "quote", "stats", "cta"],
                    },
                    "title": {"type": "string", "minLength": 1, "maxLength": 80},
                    "subtitle": {"type": "string"},
                    "bullets": {
                        "type": "array",
                        "maxItems": 5,
                        "items": {"type": "string", "maxLength": 120},
                    },
                    "content": {"type": ["object", "string"]},
                    "icon": {
                        "type": "string",
                        "description": "Single emoji that best represents this slide's topic.",
                    },
                    "chart": {
                        "type": "object",
                        "description": "Bar chart data. Use on 'stats' slides when numbers tell the story better visually.",
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
                        "required": ["type", "data"],
                    },
                    "image": {
                        "type": "boolean",
                        "description": "Set true on ONE slide where the uploaded source image should be displayed visually.",
                    },
                    "stats": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "value": {"type": "string"},
                                "label": {"type": "string"},
                            },
                        },
                    },
                },
            },
        },
    },
}


SYSTEM_PROMPT = (
    "You are Slidegen, a senior presentation architect and strict JSON generator. "
    "Return exactly one JSON object and no markdown, comments, prose, or code fences. "
    "The object must validate against the schema in the user prompt. "
    "Use concise, presentation-ready copy; avoid filler, duplicated ideas, and generic claims. "
    "Every slide must have a clear purpose, a short title, an array of bullets, and a content field. "
    "If information is missing, infer a practical business-oriented structure instead of asking questions.\n\n"
    "VISUAL ENRICHMENT RULES:\n"
    "1. chart: On 'stats' slides with quantitative data (revenue, percentages, comparisons), add a 'chart' object with type='bar' and 2-8 data points. Only use chart when real numbers exist or can be inferred from context.\n"
    "   CRITICAL for charts: every label must be 1-2 short words (max 12 characters). Never use full sentences, long phrases, or abbreviations that need explanation. Labels must never overlap — if a label doesn't fit in 12 chars, rephrase it.\n"
    "2. image: If the user provided a source image, set image=true on EXACTLY ONE slide where the image is most relevant to the visual context. Do NOT set image=true if no source image was provided.\n"
    "3. stats: On 'stats' slides, populate the 'stats' array with 2-4 key metrics (value + label). Keep each label under 3 words."
)

# Style-specific instructions injected into the user prompt at generation time.
_VISUAL_FREEDOM = (
    "Visual freedom: look for every opportunity to show instead of tell — "
    "turn a comparison into 'two_column', a claim into 'stats' with a chart, "
    "a turning point or key idea into a 'quote', a call to action into 'cta'. "
    "Use as few words as possible. Prefer zero bullets if a visual communicates better."
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
    """Build the user prompt for generating a structured slide deck JSON payload."""
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
        "- A source image WAS uploaded. Set image=true on exactly one slide where it fits best."
        if has_image
        else "- No source image was uploaded. Do NOT set image=true on any slide."
    )

    prompt_parts.extend(
        [
            "",
            "Hard requirements:",
            f"- Return exactly {slides_count} slides.",
            "- Use only these slide types: title, content, two_column, quote, stats, cta.",
            "- The first slide must be type title.",
            "- Keep every slide title under 80 characters.",
            "- Bullets: use as few as the content demands; prefer zero if a visual type communicates better. Max 5, each under 120 characters.",
            "- Add chart to stats slides when quantitative data is present.",
            image_rule,
            "- Do not include markdown, explanations, trailing commas, or comments.",
            "- Return only valid JSON matching this JSON Schema:",
            json.dumps(PRESENTATION_JSON_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )
    return "\n".join(prompt_parts)
