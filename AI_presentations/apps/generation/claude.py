from .claude_client import call_claude
from .prompts_ru import SYSTEM_PROMPT


class ClaudePresentationClient:
    def __init__(self) -> None:
        """Initialize the compatibility wrapper for legacy generation views."""
        pass

    def draft_outline(self, prompt: str) -> str:
        """Generate a concise outline using the shared Claude client function."""
        return call_claude(
            SYSTEM_PROMPT,
            (
                "Create a concise slide deck outline for this request. "
                "Return plain text sections and bullet points.\n\n"
                f"{prompt}"
            ),
        )
