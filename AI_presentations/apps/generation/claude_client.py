import shlex
import subprocess

from django.conf import settings

from .models import GenerationSettings


CLAUDE_MODEL = "claude-sonnet-4-5"
CLAUDE_MAX_TOKENS = 4096


def get_generation_settings() -> GenerationSettings:
    """Return the singleton generation settings row or a default in-memory object."""
    try:
        return GenerationSettings.get_solo()
    except Exception:
        return GenerationSettings()


def get_claude_mode() -> str:
    """Return the configured Claude mode from the singleton admin setting."""
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


def _build_cli_command(settings_obj: GenerationSettings, system_prompt: str, user_prompt: str) -> list[str]:
    """Build the concrete Claude CLI command line from admin settings."""
    args = [settings_obj.cli_command or "claude", "-p"]
    if settings_obj.cli_model:
        args.extend(["--model", settings_obj.cli_model])
    if settings_obj.cli_disable_tools:
        args.extend(["--tools", ""])
    if settings_obj.cli_skip_permissions:
        args.append("--dangerously-skip-permissions")
    if system_prompt:
        args.extend(["--system-prompt", system_prompt])
    if settings_obj.cli_extra_args.strip():
        args.extend(shlex.split(settings_obj.cli_extra_args))
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

    client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
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
        max_tokens=CLAUDE_MAX_TOKENS,
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
    if mode == GenerationSettings.ClaudeMode.CLI:
        return _call_claude_cli(system_prompt, user_prompt, image_sources)
    return _call_claude_api(system_prompt, user_prompt, image_sources)
