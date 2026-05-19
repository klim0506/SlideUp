/**
 * Frontend mirror of apps/presentations/slide_html.
 *
 * The viewer/editor must work for two formats:
 *   - html_v1 (canonical): slide is { html, metadata, _sid? }
 *   - json_v1 (legacy):   slide is { type, title, bullets, content, ... }
 *
 * `getSafeSlideHtml(slide)` returns a sanitized HTML string for either shape.
 * For legacy slides we synthesize the same HTML the backend converter would
 * produce, so the viewer renders identically in both cases.
 */

import DOMPurify from "dompurify";

export const PRESENTATION_FORMAT_HTML_V1 = "html_v1";
export const PRESENTATION_FORMAT_JSON_V1 = "json_v1";

const ALLOWED_TAGS = [
  "section", "article", "aside", "nav", "header", "footer", "main",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "ul", "ol", "li", "dl", "dt", "dd",
  "blockquote", "cite", "q",
  "strong", "em", "b", "i", "u", "s", "small", "mark", "br", "wbr",
  "span", "div", "figure", "figcaption", "img", "picture", "source",
  "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
  "code", "pre", "kbd", "abbr", "samp", "var", "sub", "sup",
  "time", "address", "details", "summary", "progress", "meter", "del", "ins", "ruby", "rt", "rp",
  "hr",
  // SVG
  "svg", "g", "defs", "use", "symbol", "title", "desc",
  "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "linearGradient", "radialGradient", "stop",
  "clipPath", "mask", "pattern", "marker", "foreignObject",
  "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
  "feColorMatrix", "feDropShadow", "feBlend", "feFlood", "feComposite",
];

// Не задаём кастомные ALLOWED_ATTR/ALLOWED_URI_REGEXP: кастомный URI-regexp
// заставлял DOMPurify проверять geometry-атрибуты SVG (x/y/width/viewBox/d) как
// URL и вырезать их — SVG-графики рендерились пустыми. Дефолт DOMPurify
// безопасен (блокирует javascript:, допускает cid:/data:image); строгий
// whitelist схем и атрибутов уже обеспечивает серверный санитайзер.
const PURIFY_CONFIG = {
  ALLOWED_TAGS,
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "link", "meta", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit"],
  ADD_DATA_URI_TAGS: ["img"],
  KEEP_CONTENT: true,
};

const escHtml = (value) => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const _bulletsFromLegacy = (slide) => {
  if (Array.isArray(slide?.bullets) && slide.bullets.length) {
    return slide.bullets.filter((x) => typeof x === "string" && x.trim());
  }
  if (Array.isArray(slide?.content)) {
    return slide.content.filter((x) => typeof x === "string" && x.trim());
  }
  if (slide?.content && typeof slide.content === "object") {
    for (const key of ["bullets", "items", "points"]) {
      const arr = slide.content[key];
      if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string" && x.trim());
    }
  }
  return [];
};

const _subtitleFromLegacy = (slide) => {
  if (typeof slide?.subtitle === "string" && slide.subtitle.trim()) return slide.subtitle.trim();
  const c = slide?.content;
  if (c && typeof c === "object") {
    for (const key of ["subtitle", "text", "summary"]) {
      const v = c[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  if (slide?.type === "title" && typeof c === "string" && c.trim()) return c.trim();
  return "";
};

const _statsFromLegacy = (slide) => {
  let raw = slide?.stats;
  if (!Array.isArray(raw) && slide?.content && typeof slide.content === "object") {
    raw = slide.content.stats;
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === "object")
    .map((s) => ({
      value: String(s.value ?? "").trim(),
      label: String(s.label ?? "").trim(),
    }))
    .filter((s) => s.value || s.label);
};

const _twoColumnFromLegacy = (slide) => {
  const c = slide?.content;
  let left = [];
  let right = [];
  if (c && typeof c === "object" && !Array.isArray(c)) {
    for (const key of ["left", "first", "primary", "a"]) {
      const v = c[key];
      if (Array.isArray(v)) { left = v.filter((x) => typeof x === "string"); break; }
      if (v && typeof v === "object") {
        const items = v.items || v.bullets;
        if (Array.isArray(items)) { left = items.filter((x) => typeof x === "string"); break; }
      }
    }
    for (const key of ["right", "second", "secondary", "b"]) {
      const v = c[key];
      if (Array.isArray(v)) { right = v.filter((x) => typeof x === "string"); break; }
      if (v && typeof v === "object") {
        const items = v.items || v.bullets;
        if (Array.isArray(items)) { right = items.filter((x) => typeof x === "string"); break; }
      }
    }
  }
  if (!left.length && !right.length) {
    const bullets = _bulletsFromLegacy(slide);
    const mid = Math.ceil(bullets.length / 2);
    left = bullets.slice(0, mid);
    right = bullets.slice(mid);
  }
  return [left, right];
};

const _bulletMarkers = (slide, count) => {
  const raw = Array.isArray(slide?.bulletMarkers)
    ? slide.bulletMarkers
    : Array.isArray(slide?.content?.bulletMarkers)
      ? slide.content.bulletMarkers
      : null;
  return Array.from({ length: count }, (_, i) => {
    if (raw && i < raw.length && raw[i] != null) return String(raw[i]);
    return String(i + 1).padStart(2, "0");
  });
};

const _bulletsHtml = (bullets, markers) => {
  const lis = bullets.map((b, i) => (
    `<li>` +
      `<span class="slide-bullet-marker" data-marker="true">${escHtml(markers[i] || "")}</span>` +
      `<span class="slide-bullet-text">${escHtml(b)}</span>` +
    `</li>`
  )).join("");
  return `<ul class="slide-bullets">${lis}</ul>`;
};

const _statsHtml = (stats) => {
  const lis = stats.map((s) => (
    `<li class="slide-stat">` +
      `<span class="slide-stat-value">${escHtml(s.value)}</span>` +
      `<span class="slide-stat-label">${escHtml(s.label)}</span>` +
    `</li>`
  )).join("");
  return `<ul class="slide-stats" data-slot="stats">${lis}</ul>`;
};

const _sectionOpen = (layout, { sid = "", icon = "", imageRef = "" } = {}) => {
  const idAttr = sid ? ` id="${escHtml(sid)}"` : "";
  const iconAttr = icon ? ` data-icon="${escHtml(icon)}"` : "";
  const imageAttr = imageRef ? ` data-image-ref="${escHtml(imageRef)}"` : "";
  return (
    `<section class="slide slide-${escHtml(layout)}"` +
    ` data-layout="${escHtml(layout)}" data-format="html_v1"${idAttr}${iconAttr}${imageAttr}>`
  );
};

const _legacyType = (slide) => {
  const t = typeof slide?.type === "string" ? slide.type : "";
  return ["title", "content", "two_column", "quote", "stats", "cta"].includes(t) ? t : "content";
};

/** Convert one legacy slide dict into a sanitized HTML fragment. */
export function legacyJsonSlideToHtml(slide) {
  if (!slide || typeof slide !== "object") return "";
  const layout = _legacyType(slide);
  const title = String(slide.title || "").trim();
  const subtitle = _subtitleFromLegacy(slide);
  const bullets = _bulletsFromLegacy(slide);
  const stats = _statsFromLegacy(slide);
  const icon = typeof slide.icon === "string" ? slide.icon.trim() : "";
  const imageRef = slide.image === true ? "primary" : "";
  const sid = typeof slide._sid === "string" ? slide._sid : "";

  const parts = [_sectionOpen(layout, { sid, icon, imageRef })];

  if (layout === "title") {
    parts.push(`<header class="slide-header">`);
    if (icon) parts.push(`<div class="slide-icon" aria-hidden="true">${escHtml(icon)}</div>`);
    parts.push(`<h1 class="slide-title">${escHtml(title)}</h1>`);
    if (subtitle) parts.push(`<p class="slide-subtitle">${escHtml(subtitle)}</p>`);
    parts.push(`</header>`);
  } else if (layout === "quote") {
    const body = subtitle || bullets.join(" ") || title;
    parts.push(`<blockquote class="slide-quote"><p>${escHtml(body)}</p>`);
    if (title && body && title !== body) parts.push(`<cite>${escHtml(title)}</cite>`);
    parts.push(`</blockquote>`);
  } else if (layout === "two_column") {
    const [left, right] = _twoColumnFromLegacy(slide);
    parts.push(`<h2 class="slide-title">${escHtml(title)}</h2>`);
    if (subtitle) parts.push(`<p class="slide-subtitle">${escHtml(subtitle)}</p>`);
    parts.push(`<div class="slide-columns" data-slot="columns">`);
    parts.push(`<div class="slide-column slide-column-left"><ul>${left.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul></div>`);
    parts.push(`<div class="slide-column slide-column-right"><ul>${right.map((x) => `<li>${escHtml(x)}</li>`).join("")}</ul></div>`);
    parts.push(`</div>`);
  } else if (layout === "stats") {
    parts.push(`<h2 class="slide-title">${escHtml(title)}</h2>`);
    if (subtitle) parts.push(`<p class="slide-subtitle">${escHtml(subtitle)}</p>`);
    if (stats.length) parts.push(_statsHtml(stats));
    if (bullets.length) parts.push(_bulletsHtml(bullets, _bulletMarkers(slide, bullets.length)));
  } else if (layout === "cta") {
    parts.push(`<header class="slide-header"><h2 class="slide-title">${escHtml(title)}</h2>`);
    if (subtitle) parts.push(`<p class="slide-subtitle">${escHtml(subtitle)}</p>`);
    parts.push(`</header>`);
    if (bullets.length) parts.push(_bulletsHtml(bullets, _bulletMarkers(slide, bullets.length)));
  } else {
    parts.push(`<h2 class="slide-title">${escHtml(title)}</h2>`);
    if (subtitle) parts.push(`<p class="slide-subtitle">${escHtml(subtitle)}</p>`);
    if (bullets.length) parts.push(_bulletsHtml(bullets, _bulletMarkers(slide, bullets.length)));
    if (stats.length) parts.push(_statsHtml(stats));
  }

  if (imageRef) {
    parts.push(`<figure class="slide-image" data-slot="image"><img src="cid:${escHtml(imageRef)}" alt="" data-asset="${escHtml(imageRef)}"/></figure>`);
  }

  parts.push(`</section>`);
  return parts.join("");
}

/** True if the slide is already in canonical html shape. */
export function isHtmlSlide(slide) {
  return !!(slide && typeof slide === "object" && typeof slide.html === "string" && slide.html.trim());
}

/** Best-effort title extraction for chrome that needs a label. */
export function getSlideMetadataTitle(slide, fallbackIndex = 0) {
  if (isHtmlSlide(slide)) {
    const md = slide.metadata || {};
    if (md.title) return String(md.title);
    const stripped = String(slide.html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return stripped.split(".")[0].slice(0, 80) || `Слайд ${fallbackIndex + 1}`;
  }
  return slide?.title || slide?.content?.title || `Слайд ${fallbackIndex + 1}`;
}

/** Resolve <img src="cid:foo"> against the presentation's `assets.images` list. */
export function resolveCidUrl(ref, assets) {
  if (!ref || !assets) return "";
  const images = Array.isArray(assets.images) ? assets.images : [];
  const img = ref === "primary" ? images[0] : images.find((i) => i?.name === ref);
  if (!img?.data_b64) return "";
  return `data:${img.media_type || "image/jpeg"};base64,${img.data_b64}`;
}

const _resolveCidsInHtml = (html, assets) => {
  if (!html || !assets) return html;
  return html.replace(/src="cid:([^"]+)"/g, (_match, ref) => {
    const url = resolveCidUrl(ref, assets);
    return url ? `src="${url}"` : `src=""`;
  });
};

/** Sanitize and asset-resolve a slide for safe rendering via dangerouslySetInnerHTML. */
export function getSafeSlideHtml(slide, { assets = null } = {}) {
  if (!slide) return "";
  const raw = isHtmlSlide(slide) ? slide.html : legacyJsonSlideToHtml(slide);
  const withAssets = _resolveCidsInHtml(raw, assets);
  return DOMPurify.sanitize(withAssets, PURIFY_CONFIG);
}

/** Extract the chart data so the viewer can draw a real chart instead of bars-as-html. */
export function getSlideChart(slide) {
  if (isHtmlSlide(slide)) {
    const chart = slide?.metadata?.chart;
    if (chart && Array.isArray(chart.data) && chart.data.length >= 2) return chart;
    return null;
  }
  const chart = slide?.chart;
  if (chart && Array.isArray(chart.data) && chart.data.length >= 2) return chart;
  return null;
}

/** Build a refined-slide payload to send to /api/refine-slide/. */
export function buildRefineSlidePayload(slide) {
  if (isHtmlSlide(slide)) {
    const { _sid, html, metadata } = slide;
    return _sid ? { _sid, html, metadata: metadata || {} } : { html, metadata: metadata || {} };
  }
  return slide;
}
