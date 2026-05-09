"""Tests for the legacy JSON -> canonical HTML converter."""

from django.test import SimpleTestCase

from apps.presentations.slide_html import json_slide_to_html
from apps.presentations.slide_html.renderer import (
    coerce_html_slide,
    metadata_for_legacy_slide,
)


class ConverterTests(SimpleTestCase):
    def _assert_canonical_section(self, html: str, layout: str):
        self.assertIn(f'class="slide slide-{layout}"', html)
        self.assertIn(f'data-layout="{layout}"', html)
        self.assertIn('data-format="html_v1"', html)

    def test_title_slide_renders_header_with_h1(self):
        html = json_slide_to_html({
            "type": "title",
            "title": "Welcome",
            "subtitle": "Q1 review",
            "icon": "🚀",
        })
        self._assert_canonical_section(html, "title")
        self.assertIn('class="slide-title"', html)
        self.assertIn('<h1', html)
        self.assertIn('Welcome', html)
        self.assertIn('Q1 review', html)
        self.assertIn('data-icon="🚀"', html)

    def test_content_slide_renders_bullets(self):
        html = json_slide_to_html({
            "type": "content",
            "title": "Plan",
            "bullets": ["First", "Second"],
        })
        self._assert_canonical_section(html, "content")
        self.assertIn('class="slide-bullets"', html)
        self.assertIn('First', html)
        self.assertIn('Second', html)
        self.assertIn('data-marker="true"', html)

    def test_two_column_renders_columns(self):
        html = json_slide_to_html({
            "type": "two_column",
            "title": "Pros vs cons",
            "content": {
                "left": ["fast", "cheap"],
                "right": ["risky"],
            },
        })
        self._assert_canonical_section(html, "two_column")
        self.assertIn('slide-column-left', html)
        self.assertIn('slide-column-right', html)
        self.assertIn('fast', html)
        self.assertIn('risky', html)

    def test_quote_slide_uses_blockquote(self):
        html = json_slide_to_html({
            "type": "quote",
            "title": "Einstein",
            "subtitle": "Imagination is more important than knowledge.",
        })
        self._assert_canonical_section(html, "quote")
        self.assertIn('<blockquote', html)
        self.assertIn('Imagination', html)
        self.assertIn('Einstein', html)

    def test_stats_slide_renders_stats_list(self):
        html = json_slide_to_html({
            "type": "stats",
            "title": "Numbers",
            "stats": [
                {"value": "12%", "label": "growth"},
                {"value": "$2M", "label": "ARR"},
            ],
        })
        self._assert_canonical_section(html, "stats")
        self.assertIn('class="slide-stats"', html)
        self.assertIn('12%', html)
        self.assertIn('$2M', html)

    def test_cta_slide_renders_header_and_bullets(self):
        html = json_slide_to_html({
            "type": "cta",
            "title": "Try it",
            "bullets": ["Sign up", "Book demo"],
        })
        self._assert_canonical_section(html, "cta")
        self.assertIn('Sign up', html)
        self.assertIn('Book demo', html)

    def test_image_flag_emits_figure(self):
        html = json_slide_to_html({
            "type": "title",
            "title": "Hero",
            "image": True,
        })
        self.assertIn('class="slide-image"', html)
        self.assertIn('src="cid:primary"', html)
        self.assertIn('data-image-ref="primary"', html)

    def test_chart_data_emits_chart_block(self):
        html = json_slide_to_html({
            "type": "stats",
            "title": "Sales",
            "stats": [{"value": "10", "label": "Q1"}, {"value": "12", "label": "Q2"}],
            "chart": {"type": "bar", "data": [
                {"label": "Q1", "value": 10},
                {"label": "Q2", "value": 12},
            ]},
        })
        self.assertIn('class="slide-chart"', html)
        self.assertIn('class="slide-chart-bars"', html)

    def test_unknown_type_falls_back_to_content_layout(self):
        html = json_slide_to_html({"type": "weird", "title": "X", "bullets": ["a"]})
        self._assert_canonical_section(html, "content")
        self.assertIn('a', html)

    def test_html_strings_in_legacy_fields_are_escaped(self):
        html = json_slide_to_html({
            "type": "content",
            "title": "Pwn <script>alert(1)</script>",
            "bullets": ["<img src=x onerror=alert(1)>"],
        })
        # We escaped the user content during conversion; the sanitizer further
        # filters anything else. Either way the script should not survive.
        self.assertNotIn('<script', html)
        self.assertNotIn('onerror', html)

    def test_metadata_for_legacy_slide_extracts_chart(self):
        md = metadata_for_legacy_slide({
            "type": "stats",
            "title": "Sales",
            "chart": {"type": "bar", "data": [{"label": "a", "value": 1}, {"label": "b", "value": 2}]},
        })
        self.assertEqual(md.get("layout"), "stats")
        self.assertEqual(md.get("title"), "Sales")
        self.assertEqual(md.get("chart", {}).get("type"), "bar")

    def test_coerce_html_slide_passes_through_html_slide(self):
        slide = {"html": "<section class=\"slide slide-content\" data-layout=\"content\" data-format=\"html_v1\"><h2 class=\"slide-title\">Hi</h2></section>", "metadata": {"layout": "content"}, "_sid": "abc"}
        out = coerce_html_slide(slide)
        self.assertIn("Hi", out["html"])
        self.assertEqual(out["_sid"], "abc")
        self.assertEqual(out["metadata"]["layout"], "content")

    def test_coerce_html_slide_converts_legacy(self):
        legacy = {"type": "content", "title": "Legacy", "bullets": ["x"], "_sid": "sid-1"}
        out = coerce_html_slide(legacy)
        self.assertIn("Legacy", out["html"])
        self.assertEqual(out["_sid"], "sid-1")
        self.assertEqual(out["metadata"].get("layout"), "content")
