"""Smoke tests for the HTML / PPTX exporters from canonical html slides."""

from io import BytesIO

from django.test import TestCase

from apps.exports.pdf_generator import generate_html
from apps.exports.pptx_generator import generate_pptx


HTML_DECK = {
    "title": "Demo",
    "theme": "light",
    "presentation_format": "html_v1",
    "slides": [
        {
            "html": (
                '<section class="slide slide-title" data-layout="title" data-format="html_v1">'
                '<header class="slide-header"><h1 class="slide-title">Hello</h1>'
                '<p class="slide-subtitle">Sub</p></header></section>'
            ),
            "metadata": {"layout": "title", "title": "Hello"},
        },
        {
            "html": (
                '<section class="slide slide-content" data-layout="content" data-format="html_v1">'
                '<h2 class="slide-title">Plan</h2>'
                '<ul class="slide-bullets">'
                '<li><span class="slide-bullet-marker" data-marker="true">01</span>'
                '<span class="slide-bullet-text">Ship it</span></li></ul></section>'
            ),
            "metadata": {"layout": "content", "title": "Plan"},
        },
        {
            "html": (
                '<section class="slide slide-stats" data-layout="stats" data-format="html_v1">'
                '<h2 class="slide-title">Sales</h2></section>'
            ),
            "metadata": {
                "layout": "stats",
                "title": "Sales",
                "chart": {"type": "bar", "data": [
                    {"label": "Q1", "value": 5},
                    {"label": "Q2", "value": 9},
                ]},
            },
        },
    ],
}


LEGACY_DECK = {
    "title": "Legacy",
    "theme": "light",
    "presentation_format": "json_v1",
    "slides": [
        {"type": "title", "title": "Hi", "bullets": [], "content": ""},
        {"type": "content", "title": "Plan", "bullets": ["A", "B"], "content": ""},
        {
            "type": "stats",
            "title": "Sales",
            "bullets": [],
            "content": "",
            "stats": [
                {"value": "10", "label": "Q1"},
                {"value": "20", "label": "Q2"},
            ],
        },
    ],
}


class HtmlExportTests(TestCase):
    def test_generate_html_renders_html_deck(self):
        html = generate_html(HTML_DECK, watermark=False)
        self.assertIn("Hello", html)
        self.assertIn("Ship it", html)
        self.assertIn("Sales", html)
        self.assertIn("class=\"slide slide-title\"", html)

    def test_generate_html_handles_legacy_deck(self):
        html = generate_html(LEGACY_DECK, watermark=True)
        self.assertIn("Plan", html)
        self.assertIn("class=\"slide slide-title\"", html)
        self.assertIn("slidegen.ru", html)


class PptxExportTests(TestCase):
    def test_generate_pptx_html_deck_returns_bytes(self):
        from pptx import Presentation as PPTXPresentation

        data = generate_pptx(HTML_DECK, watermark=False)
        self.assertIsInstance(data, (bytes, bytearray))
        self.assertGreater(len(data), 0)
        pptx = PPTXPresentation(BytesIO(data))
        self.assertEqual(len(pptx.slides), 3)

    def test_generate_pptx_legacy_deck_returns_bytes(self):
        from pptx import Presentation as PPTXPresentation

        data = generate_pptx(LEGACY_DECK, watermark=True)
        self.assertGreater(len(data), 0)
        pptx = PPTXPresentation(BytesIO(data))
        self.assertEqual(len(pptx.slides), 3)
