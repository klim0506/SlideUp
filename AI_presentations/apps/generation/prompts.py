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
                                        "label": {"type": "string", "maxLength": 24},
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
    "2. image: If the user provided a source image, set image=true on EXACTLY ONE slide where the image is most relevant to the visual context. Do NOT set image=true if no source image was provided.\n"
    "3. stats: On 'stats' slides, populate the 'stats' array with 2-4 key metrics (value + label)."
)


def build_prompt(topic, context="", audience="", slides_count=8, tone="", language="Russian", has_image=False) -> str:
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
            "- Use 0-5 bullets per slide; each bullet must be under 120 characters.",
            "- Add chart to stats slides when quantitative data is present.",
            image_rule,
            "- Do not include markdown, explanations, trailing commas, or comments.",
            "- Return only valid JSON matching this JSON Schema:",
            json.dumps(PRESENTATION_JSON_SCHEMA, ensure_ascii=False, indent=2),
        ]
    )
    return "\n".join(prompt_parts)
