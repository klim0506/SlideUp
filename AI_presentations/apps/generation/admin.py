from datetime import timedelta

from django.contrib import admin
from django.db.models import Avg, Count, Q, Sum
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils import timezone
from django.utils.html import format_html

from .models import GenerationJob, GenerationSettings


@admin.register(GenerationSettings)
class GenerationSettingsAdmin(admin.ModelAdmin):
    list_display = ("claude_mode", "updated_at", "open_dashboard")
    fieldsets = (
        (
            None,
            {
                "fields": ("claude_mode",),
            },
        ),
        (
            "Claude CLI",
            {
                "fields": (
                    "cli_command",
                    "cli_model",
                    "cli_timeout_seconds",
                    "cli_extra_args",
                    "cli_disable_tools",
                    "cli_skip_permissions",
                ),
                "description": (
                    "Настройки реального CLI runner. По умолчанию runner вызывает "
                    "`claude -p` и добавляет system prompt автоматически."
                ),
            },
        ),
    )

    def get_urls(self):
        """Add a custom admin dashboard page for generation controls and metrics."""
        urls = super().get_urls()
        custom_urls = [
            path(
                "dashboard/",
                self.admin_site.admin_view(self.dashboard_view),
                name="generation_dashboard",
            ),
        ]
        return custom_urls + urls

    def has_add_permission(self, request):
        """Allow adding generation settings only while the singleton row is absent."""
        return not GenerationSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        """Prevent deleting the generation settings singleton from the admin."""
        return False

    @admin.display(description="Dashboard")
    def open_dashboard(self, obj):
        """Render a quick link to the generation dashboard."""
        url = reverse("admin:generation_dashboard")
        return format_html('<a href="{}">Open dashboard</a>', url)

    def dashboard_view(self, request):
        """Render generation stats and a shortcut to the singleton settings record."""
        now = timezone.now()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        settings_obj = GenerationSettings.get_solo()
        jobs = GenerationJob.objects.all()
        summary = jobs.aggregate(
            total=Count("id"),
            success=Count("id", filter=Q(status=GenerationJob.Status.SUCCESS)),
            errors=Count("id", filter=Q(status=GenerationJob.Status.ERROR)),
            rejected=Count("id", filter=Q(status=GenerationJob.Status.REJECTED)),
            avg_duration=Avg("duration_ms"),
            total_slides=Sum("slides_requested"),
        )
        jobs_24h = jobs.filter(created_at__gte=day_ago)
        jobs_7d = jobs.filter(created_at__gte=week_ago)
        by_mode = list(
            jobs.values("claude_mode").annotate(total=Count("id")).order_by("claude_mode")
        )
        by_task = list(
            jobs.values("task_type").annotate(total=Count("id")).order_by("task_type")
        )
        recent_jobs = jobs.select_related("user")[:20]
        error_jobs = jobs.filter(
            status__in=[GenerationJob.Status.ERROR, GenerationJob.Status.REJECTED]
        ).select_related("user")[:10]
        success_total = summary["success"] or 0
        total = summary["total"] or 0
        success_rate = round((success_total / total) * 100, 1) if total else 0
        context = {
            **self.admin_site.each_context(request),
            "title": "Generation Dashboard",
            "settings_obj": settings_obj,
            "cli_command_preview": settings_obj.cli_command or "claude",
            "settings_change_url": reverse(
                "admin:generation_generationsettings_change",
                args=[settings_obj.pk],
            ),
            "summary": summary,
            "success_rate": success_rate,
            "jobs_24h": jobs_24h.count(),
            "jobs_7d": jobs_7d.count(),
            "by_mode": by_mode,
            "by_task": by_task,
            "recent_jobs": recent_jobs,
            "error_jobs": error_jobs,
        }
        return TemplateResponse(
            request,
            "admin/generation/dashboard.html",
            context,
        )


@admin.register(GenerationJob)
class GenerationJobAdmin(admin.ModelAdmin):
    list_display = (
        "created_at",
        "task_type",
        "claude_mode",
        "status",
        "slides_requested",
        "duration_ms",
        "user",
        "has_source_file",
    )
    list_filter = ("task_type", "claude_mode", "status", "has_source_file", "created_at")
    search_fields = ("user__email", "session_key", "error_message")
    readonly_fields = (
        "user",
        "session_key",
        "task_type",
        "claude_mode",
        "status",
        "slides_requested",
        "prompt_length",
        "has_source_file",
        "error_message",
        "duration_ms",
        "created_at",
        "finished_at",
    )

    def has_add_permission(self, request):
        """Disallow manual generation job creation from the admin."""
        return False
