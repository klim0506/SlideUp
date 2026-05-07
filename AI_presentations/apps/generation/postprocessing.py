import json
import re
from copy import deepcopy
from typing import Any


MAX_TITLE_LENGTH = 80
MAX_BULLET_LENGTH = 120
MAX_BULLETS = 5
MIN_SLIDES = 1

VALID_SLIDE_TYPES = {"title", "content", "two_column", "quote", "stats", "cta"}


def parse_json(raw: str) -> dict:
    """Parse Claude output as JSON using direct parse, markdown fence stripping, then object regex fallback."""
    if not isinstance(raw, str):
        raise ValueError("Raw response must be a string.")

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    stripped = raw.strip()
    fenced_match = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", stripped, re.DOTALL)
    if fenced_match:
        try:
            return json.loads(fenced_match.group(1))
        except json.JSONDecodeError:
            pass

    object_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if object_match:
        try:
            return json.loads(object_match.group(0))
        except json.JSONDecodeError as exc:
            raise ValueError("Could not parse JSON object from response.") from exc

    raise ValueError("Could not parse JSON from response.")


def validate_structure(data: dict, expected_slides_count=None) -> None:
    """Validate that parsed deck data contains a title and enough typed slides with titles."""
    if not isinstance(data, dict):
        raise ValueError("Parsed data must be a dictionary.")
    if not data.get("title"):
        raise ValueError("Presentation title is required.")

    slides = data.get("slides")
    if not isinstance(slides, list):
        raise ValueError("Slides must be a list.")
    if len(slides) < MIN_SLIDES:
        raise ValueError(f"At least {MIN_SLIDES} slides are required.")
    if expected_slides_count is not None and len(slides) != expected_slides_count:
        raise ValueError(f"Expected {expected_slides_count} slides, got {len(slides)}.")

    for index, slide in enumerate(slides, start=1):
        if not isinstance(slide, dict):
            raise ValueError(f"Slide {index} must be an object.")
        slide_type = slide.get("type")
        if slide_type not in VALID_SLIDE_TYPES:
            raise ValueError(f"Slide {index} has invalid type: {slide_type}.")
        if not slide.get("title"):
            raise ValueError(f"Slide {index} title is required.")


def _truncate(text, max_len, suffix="...") -> str:
    """Return text shortened to max_len characters, appending suffix when truncation occurs."""
    text = str(text)
    if len(text) <= max_len:
        return text
    if max_len <= len(suffix):
        return suffix[:max_len]
    return text[: max_len - len(suffix)].rstrip() + suffix


def _sanitize_title(title, slide_index) -> str:
    """Convert a slide title to clean text, collapse whitespace, and truncate to the title limit."""
    title_text = re.sub(r"\s+", " ", str(title)).strip()
    if not title_text:
        title_text = f"Slide {slide_index}"
    return _truncate(title_text, MAX_TITLE_LENGTH)


def _sanitize_bullets(bullets, slide_index) -> list[str]:
    """Return up to MAX_BULLETS string bullets with whitespace collapsed and length capped."""
    if not isinstance(bullets, list):
        return []

    sanitized = []
    for bullet in bullets:
        if not isinstance(bullet, str):
            continue
        bullet_text = re.sub(r"\s+", " ", bullet).strip()
        if not bullet_text:
            continue
        sanitized.append(_truncate(bullet_text, MAX_BULLET_LENGTH))
        if len(sanitized) >= MAX_BULLETS:
            break
    return sanitized


def _sanitize_chart(chart) -> dict | None:
    """Validate and clean a chart object; return None if malformed."""
    if not isinstance(chart, dict):
        return None
    if chart.get("type") != "bar":
        return None
    data = chart.get("data")
    if not isinstance(data, list) or len(data) < 2:
        return None
    clean_data = []
    for point in data[:8]:
        if not isinstance(point, dict):
            continue
        label = str(point.get("label", "")).strip()[:24]
        try:
            value = float(point["value"])
        except (KeyError, TypeError, ValueError):
            continue
        if label:
            clean_data.append({"label": label, "value": value})
    if len(clean_data) < 2:
        return None
    result: dict = {"type": "bar", "data": clean_data}
    if isinstance(chart.get("title"), str) and chart["title"].strip():
        result["title"] = chart["title"].strip()
    return result


def _sanitize_slide(slide, index) -> dict:
    """Return a sanitized copy of one slide with reassigned index, title, and bullets."""
    sanitized = deepcopy(slide)
    sanitized["index"] = index
    sanitized["title"] = _sanitize_title(sanitized.get("title", ""), index)
    sanitized["bullets"] = _sanitize_bullets(sanitized.get("bullets", []), index)

    raw_icon = sanitized.get("icon")
    if isinstance(raw_icon, str) and raw_icon.strip():
        sanitized["icon"] = raw_icon.strip()
    else:
        sanitized.pop("icon", None)

    raw_chart = sanitized.get("chart")
    clean_chart = _sanitize_chart(raw_chart)
    if clean_chart:
        sanitized["chart"] = clean_chart
    else:
        sanitized.pop("chart", None)

    if sanitized.get("image") is not True:
        sanitized.pop("image", None)

    return sanitized


def sanitize_slides(data) -> dict:
    """Return a sanitized copy of presentation data with normalized slide indexes and text fields."""
    sanitized: dict[str, Any] = deepcopy(data)
    sanitized["title"] = _sanitize_title(sanitized.get("title", ""), 0)
    slides = [
        _sanitize_slide(slide, index)
        for index, slide in enumerate(sanitized.get("slides", []), start=1)
    ]
    # At most one slide may carry image=True
    image_assigned = False
    for slide in slides:
        if slide.get("image") is True:
            if image_assigned:
                del slide["image"]
            else:
                image_assigned = True
    sanitized["slides"] = slides
    return sanitized


def postprocess(raw: str, expected_slides_count=None) -> dict:
    """Parse, validate, and sanitize a raw Claude JSON response, raising ValueError on failure."""
    data = parse_json(raw)
    validate_structure(data, expected_slides_count=expected_slides_count)
    return sanitize_slides(data)
