import uuid

from django.conf import settings
from django.db import models


class Presentation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="presentations",
    )
    session_key = models.CharField(max_length=128, blank=True)
    title = models.CharField(max_length=255)
    style = models.CharField(max_length=32, default="pitch")
    theme = models.CharField(max_length=32, default="light")
    theme_custom = models.JSONField(null=True, blank=True)
    slides = models.JSONField(default=list, blank=True)
    slide_histories = models.JSONField(default=dict, blank=True)
    assets = models.JSONField(null=True, blank=True)
    is_public = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title


class ColorScheme(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="color_schemes",
    )
    name = models.CharField(max_length=100, default="Без названия")
    bg = models.CharField(max_length=7, default="#f7fbff")
    ink = models.CharField(max_length=7, default="#0b1f3a")
    accent = models.CharField(max_length=7, default="#2563eb")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.user})"
