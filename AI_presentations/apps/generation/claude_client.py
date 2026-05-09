import logging
import os
import shlex
import shutil
import subprocess

from django.conf import settings

from .models import GenerationSettings

logger = logging.getLogger(__name__)


CLAUDE_MODEL = "claude-sonnet-4-5"
# Default ceiling for Anthropic API ``max_tokens``. Operators can override via
# admin (GenerationSettings.api_max_tokens) or the Django setting
# ``GENERATION_API_MAX_TOKENS``. Larger values let the model emit richer,
# more visually complex slide HTML.
CLAUDE_MAX_TOKENS = 16384
# Hard bounds for the override; we don't want a typo to crash the request or
# blow up the bill.
CLAUDE_MAX_TOKENS_FLOOR = 1024
CLAUDE_MAX_TOKENS_CEILING = 32000


def _resolve_max_tokens(settings_obj: GenerationSettings) -> int:
    """Resolve the effective max_tokens for an Anthropic API call."""
    override = (getattr(settings, "GENERATION_API_MAX_TOKENS", None))
    raw: int | None
    if override is not None:
        try:
            raw = int(override)
        except (TypeError, ValueError):
            raw = None
    else:
        raw = getattr(settings_obj, "api_max_tokens", None)
    if not raw:
        raw = CLAUDE_MAX_TOKENS
    return max(CLAUDE_MAX_TOKENS_FLOOR, min(int(raw), CLAUDE_MAX_TOKENS_CEILING))


def get_generation_settings() -> GenerationSettings:
    """Return the singleton generation settings row or a default in-memory object."""
    try:
        return GenerationSettings.get_solo()
    except Exception:
        return GenerationSettings()


def get_claude_mode() -> str:
    """Return api/cli: env GENERATION_CLAUDE_MODE overrides admin Generation settings."""
    override = (getattr(settings, "GENERATION_CLAUDE_MODE", "") or "").strip().lower()
    if override in (GenerationSettings.ClaudeMode.API, GenerationSettings.ClaudeMode.CLI):
        return override
    return get_generation_settings().claude_mode


def _build_cli_prompt(system_prompt: str, user_prompt: str, image_sources=None) -> str:
    """Build the user-facing prompt payload for Claude CLI."""
    prompt = user_prompt
    if image_sources:
        prompt += (
            "\n\nAttached source images were available in API mode only. "
            "If their content matters, mention that the CLI runner currently falls back to text-only generation."
        )
    return prompt


def _anthropic_api_key() -> str:
    return (getattr(settings, "ANTHROPIC_API_KEY", "") or "").strip()


def _split_cli_command(cli_command: str | None) -> list[str]:
    """Split admin «cli command» into argv tokens (same rules as the shell on this OS)."""
    cmd = (cli_command or "claude").strip()
    if not cmd:
        return ["claude"]
    # On Windows, posix=True treats backslashes in paths as escapes (breaks C:\\foo\\bar.exe).
    return shlex.split(cmd, posix=os.name != "nt")


def _cli_argv0_exists(cli_command: str | None) -> bool:
    """Return True if the first token of cli_command exists as an executable (PATH or absolute path)."""
    parts = _split_cli_command(cli_command)
    if not parts:
        return False
    argv0 = parts[0]
    if os.path.isabs(argv0):
        return os.path.isfile(argv0) and os.access(argv0, os.X_OK)
    return shutil.which(argv0) is not None


def _build_cli_command(settings_obj: GenerationSettings, system_prompt: str, user_prompt: str) -> list[str]:
    """Build the concrete Claude CLI command line from admin settings."""
    args = list(_split_cli_command(settings_obj.cli_command))
    args.append("-p")
    if settings_obj.cli_model:
        args.extend(["--model", settings_obj.cli_model])
    if settings_obj.cli_disable_tools:
        args.extend(["--tools", ""])
    if settings_obj.cli_skip_permissions:
        args.append("--dangerously-skip-permissions")
    if system_prompt:
        args.extend(["--system-prompt", system_prompt])
    if settings_obj.cli_extra_args.strip():
        args.extend(shlex.split(settings_obj.cli_extra_args, posix=os.name != "nt"))
    args.append(user_prompt)
    return args


def _call_claude_cli(system_prompt: str, user_prompt: str, image_sources=None) -> str:
    """Run an external Claude CLI command and return its stdout as model output."""
    settings_obj = get_generation_settings()
    prompt = _build_cli_prompt(system_prompt, user_prompt, image_sources)
    cmd = _build_cli_command(settings_obj, system_prompt, prompt)

    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=max(int(settings_obj.cli_timeout_seconds or 120), 1),
            check=False,
        )
    except FileNotFoundError as exc:
        raise ValueError(
            f"Claude CLI command not found: {settings_obj.cli_command or 'claude'}. "
            "Set the correct executable path in Generation settings."
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError(
            f"Claude CLI timed out after {max(int(settings_obj.cli_timeout_seconds or 120), 1)} seconds."
        ) from exc
    except OSError as exc:
        raise ValueError(f"Failed to start Claude CLI: {exc}") from exc

    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()
    if completed.returncode != 0:
        detail = stderr or stdout or f"exit code {completed.returncode}"
        raise ValueError(f"Claude CLI exited with code {completed.returncode}: {detail}")
    if not stdout:
        raise ValueError("Claude CLI returned an empty response.")
    return stdout


def _call_claude_api(system_prompt: str, user_prompt: str, image_sources=None) -> str:
    """Call Claude through the Anthropic SDK and return the first text block."""
    from anthropic import Anthropic

    api_key = _anthropic_api_key()
    if not api_key:
        raise ValueError(
            "Не задан ключ Anthropic: добавьте переменную окружения ANTHROPIC_API_KEY для бэкенда."
        )

    client = Anthropic(api_key=api_key)
    content: list = []
    if image_sources:
        for img in image_sources:
            content.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img["media_type"],
                        "data": img["data_b64"],
                    },
                }
            )
    content.append({"type": "text", "text": user_prompt})
    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=_resolve_max_tokens(get_generation_settings()),
        system=system_prompt,
        messages=[
            {
                "role": "user",
                "content": content,
            }
        ],
    )
    return message.content[0].text


def call_claude(system_prompt, user_prompt, image_sources=None) -> str:
    """Call Claude in the configured mode and return the generated text response."""
    mode = get_claude_mode()
    settings_obj = get_generation_settings()
    if mode == GenerationSettings.ClaudeMode.CLI:
        if _cli_argv0_exists(settings_obj.cli_command):
            return _call_claude_cli(system_prompt, user_prompt, image_sources)
        strict = getattr(settings, "GENERATION_CLI_STRICT", False)
        if _anthropic_api_key() and not strict:
            logger.warning(
                "Claude CLI (%r) недоступен в PATH — выполняется запрос через Anthropic API.",
                (settings_obj.cli_command or "claude").strip(),
            )
            return _call_claude_api(system_prompt, user_prompt, image_sources)
        raise ValueError(
            "В режиме CLI не найден исполняемый файл Claude Code (команда «"
            + (settings_obj.cli_command or "claude")
            + "»). В Docker установите CLI в образ или смонтируйте бинарник, "
            "укажите полный путь в Generation settings → cli command, либо задайте "
            "ANTHROPIC_API_KEY — тогда запрос уйдёт через API."
        )
    return _call_claude_api(system_prompt, user_prompt, image_sources)
