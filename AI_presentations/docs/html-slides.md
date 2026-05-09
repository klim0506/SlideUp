# Canonical HTML slide format

The presentation engine stores slides as **sanitized HTML fragments**. JSON-shaped
slides (`type`, `bullets`, `content`, ...) are still readable via a lazy adapter
but every new presentation is generated, edited, and exported from HTML.

## Slide shape

A slide is a JSON object with two required fields plus an optional stable id:

```json
{
  "html": "<section class=\"slide slide-content\" data-layout=\"content\" data-format=\"html_v1\">…</section>",
  "metadata": {
    "layout": "title|content|two_column|stats|quote|cta",
    "title": "short text label for chrome / TOC",
    "icon": "🚀",
    "image_ref": "primary|null",
    "notes": "speaker notes",
    "chart": { "type": "bar", "data": [{ "label": "Q1", "value": 10 }, …] }
  },
  "_sid": "stable uuid (used by slide history)"
}
```

`Presentation.presentation_format` is `"json_v1"` for legacy decks and
`"html_v1"` for the canonical format. The serializer always returns
`presentation_format` so clients can branch if needed.

## HTML subset

The sanitizer (`apps.presentations.slide_html.sanitizer`) accepts only:

- **Tags:** `section, header, footer, h1-h4, p, ul, ol, li, blockquote, cite,
  strong, em, b, i, u, s, small, mark, br, span, div, figure, figcaption, img,
  table, thead, tbody, tfoot, tr, td, th, caption, code, pre, kbd, abbr, hr`.
- **Attributes:** `class, id, style, data-layout, data-format, data-role,
  data-slot, data-marker, data-icon, data-image-ref, data-asset, href, title,
  rel, target, src, alt, width, height, scope, colspan, rowspan, start, type,
  cite`.
- **CSS properties** (inline `style`): `color, background-color, font-size,
  font-weight, font-style, text-align, text-decoration, letter-spacing,
  line-height, list-style, padding(-*), margin(-*), border(-*), width, height,
  max-width, max-height, display, grid-template-columns, gap, opacity`.
- **URL schemes:** `http, https, mailto, cid, data:image/(png|jpe?g|gif|webp|svg+xml)`.
  `cid:foo` references an entry in `Presentation.assets.images` (resolved at
  render/export time).

Anything outside this whitelist is **dropped** by `bleach` server-side and
`DOMPurify` client-side. Same whitelist on both sides — the frontend can never
render markup the backend would have rejected.

### Canonical CSS class hooks

The viewer, miniature, PDF/HTML and PPTX renderers all key off these classes:

| Class                       | Purpose                                  |
|-----------------------------|------------------------------------------|
| `slide`                     | Outer `<section>` wrapper                |
| `slide-{layout}`            | Layout-specific styling hook             |
| `slide-title`               | Heading (`h1` for title layout, `h2` else) |
| `slide-subtitle`            | Optional secondary line                  |
| `slide-bullets`             | Top-level bullet list                    |
| `slide-bullet-marker`       | Numeric/symbol marker inside `<li>`      |
| `slide-bullet-text`         | Body of bullet item                      |
| `slide-stats`               | Stats grid                               |
| `slide-stat-value/-label`   | Big number + caption                     |
| `slide-columns`             | Two-column container                     |
| `slide-column-{left,right}` | Side panels                              |
| `slide-quote`               | Blockquote layout                        |
| `slide-image`               | Figure containing the source image       |
| `slide-chart`               | Chart placeholder for the web preview    |

Charts are kept **structured** in `metadata.chart` so PPTX exports can render a
native chart instead of bitmap-mapping our `<ul>`.

## Writing path

1. **Generation** — `apps.generation.prompts.SYSTEM_PROMPT` instructs Claude to
   emit `{title, slides:[{html, metadata}]}`.
2. **Postprocessing** — `apps.generation.postprocessing.postprocess` parses the
   response, sanitizes every slide's HTML, normalizes `metadata`, and tags the
   result with `presentation_format = "html_v1"`.
3. **Persistence** — `apps.generation.views.GeneratePresentationView` writes
   `slides` (html shape) + `presentation_format` to the DB.
4. **Refine / Assist-deck** — same contract; the prompts force the model to keep
   `{html, metadata}` per slide.

## Reading path

`apps.presentations.slide_html.coerce_html_slide(slide)` is the single entry
point. It accepts:

- a slide already in `{html, metadata}` shape — re-sanitizes, fills missing
  `metadata.title`,
- a legacy `{type, title, bullets, …}` slide — runs the converter,
- a raw HTML string — wraps it as `{html, metadata: {}}`.

Callers downstream (`pdf_generator.generate_html`, `pptx_generator.generate_pptx`,
the React `<SlideCanvas>`) never branch on the storage format themselves.

## Exports

- **HTML / PDF** — `templates/exports/presentation.html` injects each slide's
  sanitized HTML directly with `{{ slide.html|safe }}`. Asset `cid:` references
  are inlined as base64 data URIs at render time.
- **PPTX** — `apps.exports.pptx_generator` parses the slide HTML with `lxml` and
  maps recognized blocks (`slide-title`, `slide-bullets`, `slide-stats`,
  `slide-columns`, `slide-quote`, `slide-image`) to python-pptx shapes. Charts
  use `metadata.chart` natively. Anything unrecognized degrades to a single
  textbox of stripped text — never a hard failure.

Both export paths emit log lines (`export.html`, `export.pdf`, `export.pptx`)
with slide count, duration, payload size, and PPTX fallback count.

## Migrating legacy decks

```bash
# What would change?
python manage.py migrate_slides_to_html --dry-run

# Convert a single deck
python manage.py migrate_slides_to_html --id <uuid>

# Convert in batches
python manage.py migrate_slides_to_html --limit 200 --report /tmp/run.json

# Roll back: restore the legacy slides backed up under assets._legacy_slides
python manage.py migrate_slides_to_html --rollback
```

The command is idempotent and keeps a copy of the original slide list under
`Presentation.assets["_legacy_slides"]` until you explicitly roll back.

## Security checklist

- **Never** call `dangerouslySetInnerHTML` (or `|safe` in templates) on raw
  slide HTML — always go through `getSafeSlideHtml` / `sanitize_slide_html`.
- The sanitizer is the **only** gate. If you need a new tag/attribute/CSS
  property, add it to `apps/presentations/slide_html/sanitizer.py` and the
  matching frontend whitelists in `frontend/src/lib/slideHtml.js`.
- The presentation API rejects PATCH bodies with disallowed slide HTML; clients
  cannot bypass sanitization via `PATCH /api/presentations/<id>/`.
- Asset `cid:` references are resolved against the deck's own assets bag — they
  cannot escape to another deck.

## Operational notes

- Adding a new slide layout: extend `metadata.layout` enum in
  `apps/generation/prompts.py`, teach `apps.presentations.slide_html.converter`
  to emit it from legacy data (if needed), and add a renderer branch in
  `apps/exports/pptx_generator.py`. Default fallback is `content`.
- Adding a new visual class: extend the canonical class table above, add it to
  the PDF/HTML CSS in `templates/exports/presentation.html`, and the miniature
  CSS in `frontend/src/lib/slidePreview.jsx`.
- The HTML format version is `html_v1`. Any breaking format change must bump
  the version and add a backfill step (mirror the `migrate_slides_to_html`
  pattern).
