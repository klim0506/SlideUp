from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import CustomUser, UserEmailEvent


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ("email", "is_staff", "is_active")
    ordering = ("email",)
    search_fields = ("email",)
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name")}),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "password1", "password2", "is_staff", "is_superuser"),
            },
        ),
    )


@admin.register(UserEmailEvent)
class UserEmailEventAdmin(admin.ModelAdmin):
    list_display = ("user", "event_type", "period_key", "created_at")
    list_filter = ("event_type", "created_at")
    search_fields = ("user__email", "period_key")
    readonly_fields = ("created_at",)
