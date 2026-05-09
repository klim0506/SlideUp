"""Tests for the html_v1 postprocessing pipeline."""

import json

from django.test import SimpleTestCase

from apps.generation.postprocessing import (
    parse_json,
    postprocess,
    postprocess_single_slide,
)
from apps.presentations.slide_html import PRESENTATION_FORMAT_HTML_V1


class ParseJsonTests(SimpleTestCase):
    def test_parses_plain_json(self):
        self.assertEqual(parse_json('{"a": 1}'), {"a": 1})

    def test_strips_markdown_fence(self):
        self.assertEqual(parse_json('```json\n{"a": 1}\n```'), {"a": 1})

    def test_extracts_object_from_prose(self):
        self.assertEqual(parse_json('here is your data: {"a": 2} cheers'), {"a": 2})

    def test_raises_on_garbage(self):
        with self.assertRaises(ValueError):
            parse_json('not json at all')


VALID_DECK = {
    "title": "My deck",
    "slides": [
        {
            "html": (
                '<section class="slide slide-title" data-layout="title" data-format="html_v1">'
                '<header class="slide-header"><h1 class="slide-title">Hello</h1>'
                '<p class="slide-subtitle">Welcome</p></header></section>'
            ),
            "metadata": {"layout": "title", "title": "Hello"},
        },
        {
            "html": (
                '<section class="slide slide-content" data-layout="content" data-format="html_v1">'
                '<h2 class="slide-title">Plan</h2>'
                '<ul class="slide-bullets">'
                '<li><span class="slide-bullet-marker" data-marker="true">01</span>'
                '<span class="slide-bullet-text">Item</span></li></ul></section>'
            ),
            "metadata": {"layout": "content", "title": "Plan"},
        },
    ],
}


class PostprocessTests(SimpleTestCase):
    def test_html_payload_passes_through(self):
        out = postprocess(json.dumps(VALID_DECK), expected_slides_count=2)
        self.assertEqual(out["title"], "My deck")
        self.assertEqual(out["presentation_format"], PRESENTATION_FORMAT_HTML_V1)
        self.assertEqual(len(out["slides"]), 2)
        for s in out["slides"]:
            self.assertIn("html", s)
            self.assertIn("metadata", s)
            self.assertIn(s["metadata"]["layout"], {"title", "content"})

    def test_legacy_payload_is_converted_to_html(self):
        legacy_deck = {
            "title": "Legacy",
            "slides": [
                {"type": "title", "title": "Hi", "bullets": [], "content": ""},
                {"type": "content", "title": "Plan", "bullets": ["A", "B"], "content": ""},
            ],
        }
        out = postprocess(json.dumps(legacy_deck), expected_slides_count=2)
        self.assertEqual(out["presentation_format"], PRESENTATION_FORMAT_HTML_V1)
        self.assertEqual(len(out["slides"]), 2)
        self.assertIn("class=\"slide slide-title\"", out["slides"][0]["html"])
        self.assertIn("Plan", out["slides"][1]["html"])

    def test_strips_xss_in_html(self):
        deck = {
            "title": "X",
            "slides": [
                {
                    "html": '<section><h2>Hi</h2><script>alert(1)</script></section>',
                    "metadata": {"layout": "content", "title": "Hi"},
                }
            ],
        }
        out = postprocess(json.dumps(deck), expected_slides_count=1)
        self.assertNotIn("<script", out["slides"][0]["html"])

    def test_count_mismatch_raises(self):
        with self.assertRaises(ValueError):
            postprocess(json.dumps(VALID_DECK), expected_slides_count=5)

    def test_chart_metadata_is_preserved(self):
        deck = {
            "title": "Stats",
            "slides": [{
                "html": '<section class="slide slide-stats" data-layout="stats" data-format="html_v1"><h2 class="slide-title">Sales</h2></section>',
                "metadata": {
                    "layout": "stats",
                    "title": "Sales",
                    "chart": {"type": "bar", "data": [
                        {"label": "Q1", "value": 1},
                        {"label": "Q2", "value": 2},
                    ]},
                },
            }],
        }
        out = postprocess(json.dumps(deck), expected_slides_count=1)
        chart = out["slides"][0]["metadata"]["chart"]
        self.assertEqual(chart["type"], "bar")
        self.assertEqual(len(chart["data"]), 2)

    def test_image_ref_only_one_slide(self):
        deck = {
            "title": "Imgs",
            "slides": [
                {
                    "html": '<section class="slide slide-content" data-layout="content" data-format="html_v1"><h2 class="slide-title">A</h2></section>',
                    "metadata": {"layout": "content", "title": "A", "image_ref": "primary"},
                },
                {
                    "html": '<section class="slide slide-content" data-layout="content" data-format="html_v1"><h2 class="slide-title">B</h2></section>',
                    "metadata": {"layout": "content", "title": "B", "image_ref": "primary"},
                },
            ],
        }
        out = postprocess(json.dumps(deck), expected_slides_count=2)
        self.assertEqual(out["slides"][0]["metadata"].get("image_ref"), "primary")
        self.assertNotIn("image_ref", out["slides"][1]["metadata"])


class SingleSlidePostprocessTests(SimpleTestCase):
    def test_html_single_slide(self):
        raw = json.dumps({
            "html": '<section class="slide slide-content" data-layout="content" data-format="html_v1"><h2 class="slide-title">Hi</h2></section>',
            "metadata": {"layout": "content", "title": "Hi"},
        })
        slide = postprocess_single_slide(raw)
        self.assertIn("Hi", slide["html"])
        self.assertEqual(slide["metadata"]["layout"], "content")

    def test_legacy_single_slide(self):
        raw = json.dumps({"type": "content", "title": "Hi", "bullets": ["x"], "content": ""})
        slide = postprocess_single_slide(raw)
        self.assertIn("Hi", slide["html"])
        self.assertEqual(slide["metadata"]["layout"], "content")

    def test_garbage_raises(self):
        with self.assertRaises(ValueError):
            postprocess_single_slide("not json")
