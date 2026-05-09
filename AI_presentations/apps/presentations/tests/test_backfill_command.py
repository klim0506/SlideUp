"""Tests for the migrate_slides_to_html management command."""

from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from apps.presentations.models import Presentation
from apps.presentations.slide_html import (
    PRESENTATION_FORMAT_HTML_V1,
    PRESENTATION_FORMAT_JSON_V1,
)


def _make_legacy_presentation(**overrides):
    defaults = dict(
        title="Legacy",
        style="pitch",
        theme="light",
        presentation_format=PRESENTATION_FORMAT_JSON_V1,
        slides=[
            {"type": "title", "title": "Hello", "bullets": [], "content": "", "_sid": "s1"},
            {"type": "content", "title": "Plan", "bullets": ["A"], "content": "", "_sid": "s2"},
        ],
    )
    defaults.update(overrides)
    return Presentation.objects.create(**defaults)


class BackfillCommandTests(TestCase):
    def test_dry_run_does_not_write(self):
        p = _make_legacy_presentation()
        out = StringIO()
        call_command("migrate_slides_to_html", "--dry-run", stdout=out)
        p.refresh_from_db()
        self.assertEqual(p.presentation_format, PRESENTATION_FORMAT_JSON_V1)
        self.assertIn("scanned=1", out.getvalue())
        self.assertIn("dry_run=True", out.getvalue())

    def test_converts_legacy_deck(self):
        p = _make_legacy_presentation()
        call_command("migrate_slides_to_html", stdout=StringIO())
        p.refresh_from_db()
        self.assertEqual(p.presentation_format, PRESENTATION_FORMAT_HTML_V1)
        self.assertEqual(len(p.slides), 2)
        for s in p.slides:
            self.assertIn("html", s)
            self.assertIn("metadata", s)
            self.assertIn("data-format=\"html_v1\"", s["html"])
        self.assertIn("Hello", p.slides[0]["html"])
        self.assertIn("Plan", p.slides[1]["html"])
        # Stable ids preserved.
        self.assertEqual(p.slides[0]["_sid"], "s1")
        self.assertEqual(p.slides[1]["_sid"], "s2")
        # Backup retained for rollback.
        self.assertIn("_legacy_slides", (p.assets or {}))

    def test_idempotent(self):
        p = _make_legacy_presentation()
        call_command("migrate_slides_to_html", stdout=StringIO())
        out = StringIO()
        call_command("migrate_slides_to_html", stdout=out)
        # Second run should find no json_v1 rows to convert.
        self.assertIn("scanned=0", out.getvalue())
        p.refresh_from_db()
        self.assertEqual(p.presentation_format, PRESENTATION_FORMAT_HTML_V1)

    def test_rollback_restores_legacy(self):
        p = _make_legacy_presentation()
        call_command("migrate_slides_to_html", stdout=StringIO())
        call_command("migrate_slides_to_html", "--rollback", stdout=StringIO())
        p.refresh_from_db()
        self.assertEqual(p.presentation_format, PRESENTATION_FORMAT_JSON_V1)
        self.assertEqual(p.slides[0]["title"], "Hello")
        self.assertNotIn("_legacy_slides", (p.assets or {}))

    def test_targeted_id(self):
        a = _make_legacy_presentation(title="A")
        b = _make_legacy_presentation(title="B")
        call_command("migrate_slides_to_html", "--id", str(a.id), stdout=StringIO())
        a.refresh_from_db()
        b.refresh_from_db()
        self.assertEqual(a.presentation_format, PRESENTATION_FORMAT_HTML_V1)
        self.assertEqual(b.presentation_format, PRESENTATION_FORMAT_JSON_V1)
