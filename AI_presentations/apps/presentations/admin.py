from django.contrib import admin

from .models import Presentation


@admin.register(Presentation)
class PresentationAdmin(admin.ModelAdmin):
    list_display = ("title", "user", "theme", "is_public", "created_at")
    list_filter = ("theme", "is_public", "created_at")
    search_fields = ("title", "user__username", "user__email", "session_key")
