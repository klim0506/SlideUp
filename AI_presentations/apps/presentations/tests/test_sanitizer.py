"""XSS-focused tests for the slide HTML sanitizer."""

from django.test import SimpleTestCase

from apps.presentations.slide_html import sanitize_slide_html
from apps.presentations.slide_html.sanitizer import strip_to_text


class SanitizerTests(SimpleTestCase):
    def test_keeps_canonical_structural_tags(self):
        html = (
            '<section class="slide slide-content" data-layout="content" data-format="html_v1">'
            '<h2 class="slide-title">Hi</h2>'
            '<ul class="slide-bullets"><li><span class="slide-bullet-marker" data-marker="true">01</span>'
            '<span class="slide-bullet-text">Point</span></li></ul>'
            '</section>'
        )
        cleaned = sanitize_slide_html(html)
        self.assertIn('class="slide slide-content"', cleaned)
        self.assertIn('data-layout="content"', cleaned)
        self.assertIn('class="slide-title"', cleaned)
        self.assertIn('Point', cleaned)

    def test_strips_script_tags(self):
        html = '<section><h2>Title</h2><script>alert(1)</script></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('<script', cleaned)
        self.assertNotIn('alert(1)', cleaned)

    def test_strips_event_handlers(self):
        html = '<section><h2 onclick="alert(1)">Title</h2><img src="x" onerror="alert(2)"/></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('onclick', cleaned)
        self.assertNotIn('onerror', cleaned)
        self.assertIn('Title', cleaned)

    def test_strips_javascript_uri(self):
        html = '<section><a href="javascript:alert(1)">link</a></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('javascript:', cleaned.lower())

    def test_strips_vbscript_uri(self):
        html = '<section><a href="vbscript:msgbox(1)">x</a></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('vbscript:', cleaned.lower())

    def test_strips_arbitrary_data_uri(self):
        html = '<section><a href="data:text/html,<script>alert(1)</script>">x</a></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('data:text/html', cleaned)

    def test_allows_data_uri_image(self):
        html = (
            '<section><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=" alt=""/></section>'
        )
        cleaned = sanitize_slide_html(html)
        self.assertIn('data:image/png;base64', cleaned)

    def test_allows_cid_uri(self):
        html = '<section><figure class="slide-image"><img src="cid:primary" alt=""/></figure></section>'
        cleaned = sanitize_slide_html(html)
        self.assertIn('cid:primary', cleaned)

    def test_strips_iframe_object_embed(self):
        html = '<section><iframe src="https://x"></iframe><object></object><embed/></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('<iframe', cleaned)
        self.assertNotIn('<object', cleaned)
        self.assertNotIn('<embed', cleaned)

    def test_keeps_safe_inline_style(self):
        html = '<section><h2 style="color: #123456; font-size: 18pt">x</h2></section>'
        cleaned = sanitize_slide_html(html)
        self.assertIn('color', cleaned)
        self.assertIn('font-size', cleaned)

    def test_drops_disallowed_inline_style(self):
        html = '<section><h2 style="color: red; behavior: url(x); expression: alert(1)">x</h2></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('behavior', cleaned)
        self.assertNotIn('expression', cleaned)

    def test_strips_style_tag(self):
        html = '<section><style>a{color:red}</style><h2>x</h2></section>'
        cleaned = sanitize_slide_html(html)
        self.assertNotIn('<style', cleaned)

    def test_handles_non_string_input(self):
        self.assertEqual(sanitize_slide_html(None), "")
        self.assertEqual(sanitize_slide_html(""), "")
        self.assertEqual(sanitize_slide_html(123), "")  # type: ignore[arg-type]

    def test_strip_to_text_collapses_whitespace(self):
        text = strip_to_text('<p>  Hello\n\n   <strong>world</strong>  </p>')
        self.assertEqual(text, "Hello world")

    def test_strip_to_text_truncates(self):
        text = strip_to_text('<p>{0}</p>'.format("a" * 100), max_len=10)
        self.assertEqual(len(text), 10)
        self.assertTrue(text.endswith("…"))
