import json
from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.billing.models import UsageLog
from apps.billing.utils import check_and_spend_slides, check_and_spend_slides_up_to, increment_usage
from apps.presentations.models import Presentation
from apps.presentations.themes import sanitize_generation_theme

from .claude import ClaudePresentationClient
from .claude_client import call_claude, get_claude_mode
from .models import GenerationJob
from .postprocessing import parse_json, postprocess
from .prompts import SYSTEM_PROMPT, build_prompt
from .serializers import GenerationRequestSerializer
from .source_material import process_uploaded_source


MAX_CLAUDE_JSON_ATTEMPTS = 3

SINGLE_SLIDE_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor. "
    "Edit exactly one slide according to the user's instruction. "
    "Return only valid JSON for one slide object. "
    "The slide must include type, title, bullets, and content fields."
)

DECK_ASSIST_SYSTEM_PROMPT = (
    "You are Slidegen, an expert presentation editor. "
    "You receive the presentation title, an instruction, and the current slides as JSON. "
    "Return exactly one JSON object with keys title (string) and slides (array). "
    "You MUST keep the same number of slides in the same order as the input slides array. "
    "Do not add, remove, or merge slides. "
    "Each slide must include type, title, bullets, and content fields. "
    "Apply the user's instruction across the whole deck (tone, length, structure, language, clarity). "
    "Return only valid JSON — no markdown fences, comments, or explanations."
)


def _ensure_session_key(request) -> str:
    """Ensure the request has a Django session key and return it."""
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def _is_authenticated(request) -> bool:
    """Return whether the request user is authenticated."""
    return bool(request.user and request.user.is_authenticated)


def _parse_slides_count(value) -> int:
    """Parse a requested slide count, defaulting to 8 and clamping to at least 1."""
    try:
        return max(int(value), 1)
    except (TypeError, ValueError):
        return 8


def _retry_prompt(user_prompt, error, attempt) -> str:
    """Add validation feedback for a Claude retry without losing the original task."""
    return (
        f"{user_prompt}\n\n"
        f"Retry attempt {attempt}: the previous response failed JSON validation: {error}. "
        "Return a corrected response as one valid JSON object only. "
        "Do not include markdown fences, comments, or explanations."
    )


def _call_claude_with_json_retry(
    system_prompt,
    user_prompt,
    parser,
    image_sources=None,
    max_attempts=MAX_CLAUDE_JSON_ATTEMPTS,
):
    """Call Claude until the parser accepts the JSON payload or attempts are exhausted."""
    last_error = None
    for attempt in range(1, max_attempts + 1):
        prompt = user_prompt if attempt == 1 else _retry_prompt(user_prompt, last_error, attempt)
        raw = call_claude(system_prompt, prompt, image_sources)
        try:
            return parser(raw)
        except ValueError as exc:
            last_error = exc
    raise ValueError(f"Claude returned invalid JSON after {max_attempts} attempts: {last_error}")


def _postprocess_refined_slide(raw, presentation_title):
    """Parse and validate one refined slide through the shared deck postprocessor."""
    refined_slide = parse_json(raw)
    return postprocess(
        json.dumps(
            {
                "title": presentation_title,
                "slides": [refined_slide],
            },
            ensure_ascii=False,
        )
    )["slides"][0]


def _strip_internal_slide_keys(slide):
    """Remove keys that are only for client persistence (stable slide id)."""
    if not isinstance(slide, dict):
        return slide
    return {k: v for k, v in slide.items() if k != "_sid"}


def _postprocess_deck_assist(raw, presentation_title, expected_slide_count):
    """Parse a full-deck JSON response and enforce the original slide count."""
    data = postprocess(raw)
    slides = data.get("slides")
    if not isinstance(slides, list) or len(slides) != expected_slide_count:
        raise ValueError(
            f"The model must return exactly {expected_slide_count} slides in the same order; "
            f"got {len(slides) if isinstance(slides, list) else 'non-list'}."
        )
    return data


def _start_job(*, request, task_type, slides_requested, prompt_text, has_source_file):
    """Create a generation job record before model execution starts."""
    user = request.user if _is_authenticated(request) else None
    return GenerationJob.objects.create(
        user=user,
        session_key=request.session.session_key or "",
        task_type=task_type,
        claude_mode=get_claude_mode(),
        status=GenerationJob.Status.SUCCESS,
        slides_requested=max(int(slides_requested or 0), 0),
        prompt_length=len((prompt_text or "").strip()),
        has_source_file=bool(has_source_file),
    )


def _finish_job(job, *, status_value, started_at, error_message=""):
    """Finalize a generation job with status, duration, and optional error text."""
    finished_at = timezone.now()
    duration = max(int((finished_at - started_at) / timedelta(milliseconds=1)), 0)
    job.status = status_value
    job.error_message = (error_message or "")[:2000]
    job.duration_ms = duration
    job.finished_at = finished_at
    job.save(update_fields=("status", "error_message", "duration_ms", "finished_at"))


class GenerateOutlineView(APIView):
    def post(self, request):
        """Generate an outline from a prompt and return it in a JSON response."""
        serializer = GenerationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        outline = ClaudePresentationClient().draft_outline(serializer.validated_data["prompt"])
        return Response({"outline": outline}, status=status.HTTP_200_OK)


class GeneratePresentationView(APIView):
    permission_classes = []

    def post(self, request):
        """Generate a presentation, spend authenticated user credits, and persist the result."""
        started_at = timezone.now()
        prompt = (request.data.get("prompt") or "").strip()
        theme = sanitize_generation_theme(
            request.user if _is_authenticated(request) else None,
            request.data.get("theme", "light") or "light",
        )
        slides_count = _parse_slides_count(request.data.get("slides_count", 8))
        session_key = _ensure_session_key(request)

        uploaded = request.FILES.get("source_file")
        context_extra = ""
        image_sources = None
        if uploaded:
            context_extra, img_list = process_uploaded_source(uploaded)
            image_sources = img_list or None

        job = _start_job(
            request=request,
            task_type=GenerationJob.TaskType.PRESENTATION,
            slides_requested=slides_count,
            prompt_text=prompt,
            has_source_file=uploaded,
        )

        if not prompt and not uploaded:
            _finish_job(
                job,
                status_value=GenerationJob.Status.REJECTED,
                started_at=started_at,
                error_message="Prompt or source file is required.",
            )
            return Response(
                {"detail": "Укажите текст запроса или прикрепите файл."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        topic = prompt
        if not topic and uploaded:
            topic = f'Презентация по материалам файла «{uploaded.name}».'

        user = request.user if _is_authenticated(request) else None
        usage_check = None
        if user:
            usage_check = check_and_spend_slides_up_to(
                user,
                action=UsageLog.Action.GENERATE,
                slides_requested=slides_count,
            )
            if not usage_check["allowed"]:
                _finish_job(
                    job,
                    status_value=GenerationJob.Status.REJECTED,
                    started_at=started_at,
                    error_message=usage_check.get("reason", "Slide usage rejected."),
                )
                return Response(usage_check, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            data = _call_claude_with_json_retry(
                SYSTEM_PROMPT,
                build_prompt(topic=topic, slides_count=slides_count, context=context_extra, has_image=bool(image_sources)),
                lambda raw: postprocess(raw, expected_slides_count=slides_count),
                image_sources=image_sources,
            )
        except ValueError as exc:
            _finish_job(
                job,
                status_value=GenerationJob.Status.ERROR,
                started_at=started_at,
                error_message=str(exc),
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        assets = None
        if image_sources:
            assets = {"images": image_sources}

        deck_slides = data["slides"]
        slides_unlocked = None
        if user and usage_check:
            spent = int(usage_check.get("spent") or 0)
            if spent > 0 and spent < len(deck_slides):
                slides_unlocked = spent

        presentation = Presentation.objects.create(
            user=user,
            session_key=session_key,
            title=data["title"],
            theme=theme,
            slides=deck_slides,
            slides_unlocked=slides_unlocked,
            assets=assets,
        )

        if user:
            increment_usage(
                user,
                action=UsageLog.Action.GENERATE,
                slides_spent=int(usage_check["spent"]),
                presentation=presentation,
            )

        _finish_job(
            job,
            status_value=GenerationJob.Status.SUCCESS,
            started_at=started_at,
        )

        body = {
            "id": str(presentation.id),
            "title": presentation.title,
            "slides": presentation.slides,
            "theme": presentation.theme,
            "slides_unlocked": presentation.slides_unlocked,
        }
        if user and usage_check and usage_check.get("capped"):
            body["slides_billing_capped"] = True
        return Response(body, status=status.HTTP_201_CREATED)


class RefineSlideView(APIView):
    permission_classes = []

    def post(self, request):
        """Refine a single slide using Claude and return the sanitized slide object."""
        started_at = timezone.now()
        slide = request.data.get("slide")
        instruction = request.data.get("instruction", "")
        presentation_title = request.data.get("presentation_title", "Presentation")
        presentation_id = request.data.get("presentation_id")
        _ensure_session_key(request)
        job = _start_job(
            request=request,
            task_type=GenerationJob.TaskType.REFINE,
            slides_requested=1,
            prompt_text=instruction,
            has_source_file=False,
        )

        if not isinstance(slide, dict):
            _finish_job(
                job,
                status_value=GenerationJob.Status.REJECTED,
                started_at=started_at,
                error_message="Slide must be an object.",
            )
            return Response(
                {"detail": "Slide must be an object."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not instruction:
            _finish_job(
                job,
                status_value=GenerationJob.Status.REJECTED,
                started_at=started_at,
                error_message="Instruction is required.",
            )
            return Response(
                {"detail": "Instruction is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user if _is_authenticated(request) else None
        if user:
            usage_check = check_and_spend_slides(
                user,
                action=UsageLog.Action.REFINE,
                slides_count=1,
            )
            if not usage_check["allowed"]:
                _finish_job(
                    job,
                    status_value=GenerationJob.Status.REJECTED,
                    started_at=started_at,
                    error_message=usage_check.get("reason", "Refine usage rejected."),
                )
                return Response(usage_check, status=status.HTTP_429_TOO_MANY_REQUESTS)

        user_prompt = (
            f"Presentation title: {presentation_title}\n"
            f"Instruction: {instruction}\n"
            f"Slide JSON: {json.dumps(_strip_internal_slide_keys(slide) if isinstance(slide, dict) else slide, ensure_ascii=False)}"
        )

        def refine_parser(raw):
            out = _postprocess_refined_slide(raw, presentation_title)
            if isinstance(slide, dict) and slide.get("_sid") and isinstance(out, dict):
                out = {**out, "_sid": slide["_sid"]}
            return out

        try:
            refined = _call_claude_with_json_retry(
                SINGLE_SLIDE_SYSTEM_PROMPT,
                user_prompt,
                refine_parser,
            )
        except ValueError as exc:
            _finish_job(
                job,
                status_value=GenerationJob.Status.ERROR,
                started_at=started_at,
                error_message=str(exc),
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if user:
            presentation = None
            if presentation_id:
                presentation = Presentation.objects.filter(
                    pk=presentation_id,
                    user=user,
                ).first()
            increment_usage(
                user,
                action=UsageLog.Action.REFINE,
                slides_spent=1,
                presentation=presentation,
            )

        _finish_job(
            job,
            status_value=GenerationJob.Status.SUCCESS,
            started_at=started_at,
        )

        return Response({"slide": refined}, status=status.HTTP_200_OK)


class AssistDeckView(APIView):
    permission_classes = []

    def post(self, request):
        """Apply an instruction to the full slide deck; slide count and order must be preserved."""
        started_at = timezone.now()
        slides = request.data.get("slides")
        instruction = (request.data.get("instruction") or "").strip()
        presentation_title = (request.data.get("presentation_title") or "Presentation").strip()
        presentation_id = request.data.get("presentation_id")
        _ensure_session_key(request)
        job = _start_job(
            request=request,
            task_type=GenerationJob.TaskType.REFINE,
            slides_requested=1,
            prompt_text=instruction,
            has_source_file=False,
        )

        if not isinstance(slides, list) or len(slides) < 1:
            _finish_job(
                job,
                status_value=GenerationJob.Status.REJECTED,
                started_at=started_at,
                error_message="Slides must be a non-empty array.",
            )
            return Response(
                {"detail": "Slides must be a non-empty array."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not instruction:
            _finish_job(
                job,
                status_value=GenerationJob.Status.REJECTED,
                started_at=started_at,
                error_message="Instruction is required.",
            )
            return Response(
                {"detail": "Instruction is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = request.user if _is_authenticated(request) else None
        if user:
            usage_check = check_and_spend_slides(
                user,
                action=UsageLog.Action.REFINE,
                slides_count=1,
            )
            if not usage_check["allowed"]:
                _finish_job(
                    job,
                    status_value=GenerationJob.Status.REJECTED,
                    started_at=started_at,
                    error_message=usage_check.get("reason", "Assist usage rejected."),
                )
                return Response(usage_check, status=status.HTTP_429_TOO_MANY_REQUESTS)

        stripped_slides = [
            _strip_internal_slide_keys(s) if isinstance(s, dict) else s for s in slides
        ]
        slide_count = len(stripped_slides)
        user_prompt = (
            f"Presentation title: {presentation_title}\n"
            f"Required slide count (unchanged): {slide_count}\n"
            f"Instruction: {instruction}\n"
            f"Current deck JSON:\n"
            f"{json.dumps({'title': presentation_title, 'slides': stripped_slides}, ensure_ascii=False)}"
        )

        def parser(raw):
            data = _postprocess_deck_assist(raw, presentation_title, slide_count)
            merged_slides = []
            for i, s in enumerate(data.get("slides", [])):
                if i < len(slides) and isinstance(slides[i], dict) and slides[i].get("_sid"):
                    if isinstance(s, dict):
                        merged = dict(s)
                        merged["_sid"] = slides[i]["_sid"]
                        merged_slides.append(merged)
                    else:
                        merged_slides.append(s)
                else:
                    merged_slides.append(s)
            data["slides"] = merged_slides
            if not data.get("title"):
                data["title"] = presentation_title
            return data

        try:
            deck = _call_claude_with_json_retry(
                DECK_ASSIST_SYSTEM_PROMPT,
                user_prompt,
                parser,
            )
        except ValueError as exc:
            _finish_job(
                job,
                status_value=GenerationJob.Status.ERROR,
                started_at=started_at,
                error_message=str(exc),
            )
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if user:
            presentation = None
            if presentation_id:
                presentation = Presentation.objects.filter(
                    pk=presentation_id,
                    user=user,
                ).first()
            increment_usage(
                user,
                action=UsageLog.Action.REFINE,
                slides_spent=1,
                presentation=presentation,
            )

        _finish_job(
            job,
            status_value=GenerationJob.Status.SUCCESS,
            started_at=started_at,
        )

        return Response(
            {"title": deck.get("title", presentation_title), "slides": deck.get("slides", [])},
            status=status.HTTP_200_OK,
        )
