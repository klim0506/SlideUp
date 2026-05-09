"""Исходные файлы для генерации: извлечение текста и подготовка изображений для Claude."""

from __future__ import annotations

import base64
import re
from io import BytesIO

# Claude vision: jpeg, png, gif, webp (остальные типы — только текстом в промпте)
_FALLBACK_IMG_LABEL = "application/octet-stream"

# Защита от слишком больших документов: всё, что выше, обрезается с пометкой.
# Эмпирически 60k символов ≈ 15-20k токенов — безопасный потолок при модели на 4096 токенов вывода.
_MAX_EXTRACTED_CHARS = 60_000


def _truncate_extracted(text: str) -> str:
    if len(text) <= _MAX_EXTRACTED_CHARS:
        return text
    head = text[:_MAX_EXTRACTED_CHARS].rstrip()
    return f"{head}\n\n[…текст файла усечён по длине, передана начальная часть…]"


def _pptx_to_text(raw: bytes) -> str:
    from pptx import Presentation

    prs = Presentation(BytesIO(raw))
    lines: list[str] = []
    for slide in prs.slides:
        for shape in slide.shapes:
            if hasattr(shape, "text") and shape.text:
                lines.append(shape.text.strip())
    return "\n".join(lines)


def _pdf_to_text(raw: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(BytesIO(raw))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return "\n".join(parts)


def _docx_to_text(raw: bytes) -> str:
    from docx import Document

    document = Document(BytesIO(raw))
    return "\n".join(p.text for p in document.paragraphs if p.text.strip())


def process_uploaded_source(uploaded) -> tuple[str, list[dict]]:
    """
    Обрабатывает загруженный файл.

    Возвращает (дополнение к текстовому контексту промпта, список источников изображений для Claude API).
    Каждый элемент image_sources: {"media_type": str, "data_b64": str}.
    """
    name = (uploaded.name or "file").strip() or "file"
    mime = (getattr(uploaded, "content_type", None) or "").strip().lower()
    raw = uploaded.read()

    # Изображения → vision (Claude API: jpeg, png, gif, webp)
    if mime.startswith("image/") or re.search(r"\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$", name.lower()):
        mt = mime if mime.startswith("image/") else _guess_image_mime(name)
        if mt in ("image/jpeg", "image/png", "image/gif", "image/webp"):
            b64 = base64.b64encode(raw).decode("ascii")
            addendum = (
                f"\n\nПользователь приложил изображение «{name}». Учти содержимое при структуре и текстах слайдов."
            )
            return addendum, [{"media_type": mt, "data_b64": b64}]
        return (
            f"\n\nПользователь приложил изображение «{name}» (тип {mt}). "
            "Этот формат не передаётся в vision API — опирайся на текст запроса и имя файла.",
            [],
        )

    lower = name.lower()
    extracted = ""

    try:
        if lower.endswith(".txt"):
            extracted = raw.decode("utf-8", errors="replace")
        elif lower.endswith(".pdf"):
            extracted = _pdf_to_text(raw)
        elif lower.endswith(".docx"):
            extracted = _docx_to_text(raw)
        elif lower.endswith(".pptx"):
            extracted = _pptx_to_text(raw)
        elif lower.endswith(".ppt"):
            extracted = ""
        elif lower.endswith(".doc"):
            extracted = raw.decode("utf-8", errors="replace")
    except Exception as exc:  # noqa: BLE001 — хотим вернуть хотя бы имя файла
        extracted = f"[Не удалось прочитать файл: {exc}]"

    if extracted.strip():
        addendum = (
            f'\n\n--- Текст из файла «{name}» ---\n{_truncate_extracted(extracted.strip())}\n--- Конец файла ---\n'
        )
    else:
        addendum = (
            f"\n\nПользователь приложил файл «{name}» ({mime or 'тип не указан'}). "
            "Используй имя файла и текст запроса; при необходимости предложи структуру без выдуманных фактов."
        )

    return addendum, []


def _guess_image_mime(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".gif"):
        return "image/gif"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".bmp"):
        return "image/bmp"
    return _FALLBACK_IMG_LABEL
