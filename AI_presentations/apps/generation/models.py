from django.db import models


class GenerationSettings(models.Model):
    class ClaudeMode(models.TextChoices):
        API = "api", "API"
        CLI = "cli", "CLI"

    claude_mode = models.CharField(
        max_length=16,
        choices=ClaudeMode.choices,
        default=ClaudeMode.API,
    )
    cli_command = models.CharField(max_length=255, default="claude")
    cli_model = models.CharField(max_length=255, blank=True)
    cli_timeout_seconds = models.PositiveIntegerField(default=300)
    cli_extra_args = models.TextField(blank=True)
    cli_disable_tools = models.BooleanField(default=True)
    cli_skip_permissions = models.BooleanField(default=False)
    api_max_tokens = models.PositiveIntegerField(
        default=16384,
        help_text=(
            "Anthropic API max_tokens for generation calls. Larger values allow"
            " richer slides but cost more and take longer. Range 1024–32000."
        ),
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Generation settings"
        verbose_name_plural = "Generation settings"

    def __str__(self) -> str:
        """Return a readable label for the active Claude generation mode."""
        return f"Claude mode: {self.claude_mode}"

    @classmethod
    def get_solo(cls):
        """Return the singleton generation settings row, creating it when needed."""
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings


class GenerationJob(models.Model):
    class TaskType(models.TextChoices):
        PRESENTATION = "presentation", "Presentation"
        REFINE = "refine", "Refine"

    class Status(models.TextChoices):
        SUCCESS = "success", "Success"
        ERROR = "error", "Error"
        REJECTED = "rejected", "Rejected"

    user = models.ForeignKey(
        "users.CustomUser",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="generation_jobs",
    )
    session_key = models.CharField(max_length=128, blank=True)
    task_type = models.CharField(max_length=32, choices=TaskType.choices)
    claude_mode = models.CharField(
        max_length=16,
        choices=GenerationSettings.ClaudeMode.choices,
    )
    status = models.CharField(max_length=16, choices=Status.choices)
    slides_requested = models.PositiveIntegerField(default=0)
    prompt_length = models.PositiveIntegerField(default=0)
    has_source_file = models.BooleanField(default=False)
    error_message = models.TextField(blank=True)
    duration_ms = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.task_type} via {self.claude_mode} ({self.status})"
