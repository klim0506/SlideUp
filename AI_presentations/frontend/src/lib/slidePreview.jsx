/** Helpers + miniature canvas for deck slides (shared by PresentationView and SlideThumb). */

import {
  getSafeSlideHtml,
  getSlideChart,
  getSlideMetadataTitle,
  isHtmlSlide,
} from "@/lib/slideHtml";

export const DECK_SLIDE_TYPES = new Set(["title", "content", "two_column", "quote", "stats", "cta"]);

const PITCH_LAYOUT_KINDS = new Set(["cover", "two-column", "feature-grid", "metrics", "ask"]);

export function isGeneratedDeckSlide(slide) {
  if (!slide || typeof slide !== "object") return false;
  if (slide.kind && PITCH_LAYOUT_KINDS.has(slide.kind)) return false;
  if (isHtmlSlide(slide)) return true;
  if (slide.type && DECK_SLIDE_TYPES.has(slide.type)) return true;
  if (!slide.kind && typeof slide.title === "string" && slide.title.trim()) return true;
  return false;
}

export function getSlideTitle(slide, index) {
  return getSlideMetadataTitle(slide, index ?? 0);
}

export function getSlideSubtitle(slide) {
  if (!slide) return "";
  if (isHtmlSlide(slide)) return "";
  if (typeof slide.subtitle === "string") return slide.subtitle;
  if (typeof slide.content?.subtitle === "string") return slide.content.subtitle;
  if (slide.type === "title" && typeof slide.content === "string") return slide.content;
  return "";
}

export function getSlideBullets(slide) {
  if (!slide) return [];
  if (isHtmlSlide(slide)) return [];
  if (Array.isArray(slide.bullets)) return slide.bullets;
  if (Array.isArray(slide.content?.bullets)) return slide.content.bullets;
  if (Array.isArray(slide.content)) return slide.content;
  if (typeof slide.content === "string" && slide.type !== "title") return [slide.content];
  return [];
}

export function getSlideBulletMarker(slide, bulletIndex) {
  const markers = Array.isArray(slide?.bulletMarkers)
    ? slide.bulletMarkers
    : Array.isArray(slide?.content?.bulletMarkers)
      ? slide.content.bulletMarkers
      : null;
  if (markers && bulletIndex < markers.length) return String(markers[bulletIndex] ?? "");
  return String(bulletIndex + 1).padStart(2, "0");
}

export function getSlideStats(slide) {
  if (!slide) return [];
  if (isHtmlSlide(slide)) return [];
  if (Array.isArray(slide?.stats)) return slide.stats;
  if (Array.isArray(slide?.content?.stats)) return slide.content.stats;
  return [];
}

const PAGE_NUMBER_MODE_CORNER_BR = "corner_br";
const PAGE_NUMBER_MODE_CORNER_TR = "corner_tr";
const WATERMARK_MODE_CORNER_BR = "corner_br";
const WATERMARK_MODE_CORNER_TR = "corner_tr";

const THUMB_HTML_BASE_CSS = `
  .slide-thumb-html { width:100%; height:100%; padding:6.5%; box-sizing:border-box; display:flex; flex-direction:column; gap:1.6%; overflow:hidden; }
  .slide-thumb-html .slide-title { font-family: var(--font-display, inherit); font-size: 5.5%; line-height:1.04; letter-spacing:-0.03em; margin:0; }
  .slide-thumb-html .slide-subtitle { font-size: 2.4%; line-height:1.3; margin:0; opacity:0.85; }
  .slide-thumb-html .slide-bullets { list-style:none; margin:1.6% 0 0; padding:0; display:grid; gap:1.4%; }
  .slide-thumb-html .slide-bullets li { display:grid; grid-template-columns: 4.4% 1fr; gap:1.6%; align-items:baseline; font-size:2.0%; line-height:1.36; }
  .slide-thumb-html .slide-bullet-marker { font-family: var(--font-mono, monospace); font-size:0.62em; font-weight:700; }
  .slide-thumb-html .slide-stats { list-style:none; margin:0; padding:0; display:grid; grid-template-columns:1fr 1fr; gap:5%; }
  .slide-thumb-html .slide-stat { border-top: 0.4% solid currentColor; padding-top:1.2%; opacity:1; display:grid; gap:0.6%; }
  .slide-thumb-html .slide-stat-value { font-family: var(--font-display, inherit); font-size: 4.6%; font-weight:750; letter-spacing:-0.04em; line-height:1; }
  .slide-thumb-html .slide-stat-label { font-size:1.6%; line-height:1.3; opacity:0.72; }
  .slide-thumb-html .slide-columns { display:grid; grid-template-columns:1fr 1fr; gap:5%; }
  .slide-thumb-html .slide-column ul { margin:0; padding-left:4%; font-size:1.7%; line-height:1.3; }
  .slide-thumb-html .slide-column li { margin-bottom:0.7%; }
  .slide-thumb-html .slide-quote { font-size:3.4%; line-height:1.18; font-style:italic; padding-left:2.6%; border-left:0.4% solid currentColor; margin:auto 0; }
  .slide-thumb-html .slide-quote cite { display:block; margin-top:1.2%; font-style:normal; font-size:1.6%; opacity:0.78; }
  .slide-thumb-html .slide-image { margin:0; max-height:60%; }
  .slide-thumb-html .slide-image img { max-width:100%; max-height:100%; object-fit:contain; display:block; }
  .slide-thumb-html .slide-chart-bars { list-style:none; padding:0; margin:0; display:flex; align-items:flex-end; gap:1%; height:36%; }
  .slide-thumb-html .slide-chart-bars li { flex:1; display:grid; gap:0.4%; }
  .slide-thumb-html .slide-chart-label { font-size:1.4%; opacity:0.7; }
  .slide-thumb-html .slide-chart-value { font-size:1.6%; font-weight:600; }
`;

/** 16:9 miniature matching the main viewer canvas. */
export function DeckSlideThumbCanvas({
  slide,
  index,
  total,
  preset,
  fontScale = 1,
  pageNumberMode = PAGE_NUMBER_MODE_CORNER_BR,
  watermarkMode = WATERMARK_MODE_CORNER_TR,
  slideWidth = 1200,
  slideHeight = null,
  cornerRadius = 8,
  assets = null,
}) {
  const r = typeof cornerRadius === "number" && Number.isFinite(cornerRadius) && cornerRadius >= 0 ? cornerRadius : 8;
  const fs = typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const W = typeof slideWidth === "number" && Number.isFinite(slideWidth) && slideWidth > 0 ? slideWidth : 1200;
  const H = typeof slideHeight === "number" && Number.isFinite(slideHeight) && slideHeight > 0 ? slideHeight : Math.round((W * 9) / 16);

  const showCornerTR = pageNumberMode === PAGE_NUMBER_MODE_CORNER_TR;
  const showCornerBR = pageNumberMode === PAGE_NUMBER_MODE_CORNER_BR;
  const showWmTR = watermarkMode === WATERMARK_MODE_CORNER_TR;
  const showWmBR = watermarkMode === WATERMARK_MODE_CORNER_BR;
  const pageCounterText = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const slidePadPct = 6.5;
  const pageCounterCornerExtraPct = 4;
  const pageCounterRightPct = slidePadPct + pageCounterCornerExtraPct;

  const sp = (vwVal, min, max) => {
    const raw = (vwVal / 100) * W * fs;
    return `${Math.round(Math.max(min, raw))}px`;
  };
  const chromeLabelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: sp(1.1, 10, 14),
    whiteSpace: "nowrap",
  };
  const chromeGap = Math.max(8, Math.round(10 * (W / 1200) * fs));

  const safeHtml = isHtmlSlide(slide) ? getSafeSlideHtml(slide, { assets }) : "";
  const icon = typeof slide?.metadata?.icon === "string"
    ? slide.metadata.icon.trim()
    : (typeof slide?.icon === "string" ? slide.icon.trim() : "");

  return (
    <div
      style={{
        aspectRatio: "16 / 9",
        width: "100%",
        borderRadius: r,
        background: preset.bg,
        color: preset.ink,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${preset.ink}1f`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          background: preset.bg,
          color: preset.ink,
          overflow: "hidden",
        }}
      >
        {safeHtml ? (
          <>
            <style>{THUMB_HTML_BASE_CSS}</style>
            <div
              className="slide-thumb-html"
              style={{ "--accent": preset.accent, color: preset.ink }}
              dangerouslySetInnerHTML={{ __html: safeHtml }}
            />
          </>
        ) : (
          <LegacyMiniature
            slide={slide}
            index={index}
            preset={preset}
            W={W}
            H={H}
            fs={fs}
            sp={sp}
            slidePadPct={slidePadPct}
          />
        )}
        <div
          style={{
            position: "absolute",
            top: `${slidePadPct}%`,
            left: `${slidePadPct}%`,
            display: "flex",
            alignItems: "center",
            gap: chromeGap,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: sp(3.2, 20, 40), lineHeight: 1, userSelect: "none" }}>{icon || null}</div>
        </div>
        <div
          style={{
            position: "absolute",
            top: `${slidePadPct}%`,
            right: `${pageCounterRightPct}%`,
            display: "flex",
            alignItems: "center",
            gap: chromeGap,
            pointerEvents: "none",
          }}
        >
          {showWmTR ? <div style={{ ...chromeLabelStyle, color: preset.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>SlideUp</div> : null}
          {showCornerTR ? <div style={{ ...chromeLabelStyle, opacity: 0.48 }}>{pageCounterText}</div> : null}
        </div>
        {(showCornerBR || showWmBR) ? (
          <div
            style={{
              position: "absolute",
              right: `${pageCounterRightPct}%`,
              bottom: `${slidePadPct}%`,
              display: "flex",
              alignItems: "center",
              gap: chromeGap,
              pointerEvents: "none",
            }}
          >
            {showWmBR ? <div style={{ ...chromeLabelStyle, color: preset.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>SlideUp</div> : null}
            {showCornerBR ? <div style={{ ...chromeLabelStyle, opacity: 0.48 }}>{pageCounterText}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LegacyMiniature({ slide, index, preset, W, H, fs, sp, slidePadPct }) {
  const layoutUnit = (W / 1200) * fs;
  const bullets = getSlideBullets(slide).slice(0, 6);
  const stats = getSlideStats(slide).slice(0, 4);
  const subtitle = getSlideSubtitle(slide);
  const chart = getSlideChart(slide);
  const hasRightPanel = !!(chart || stats.length > 0);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: `${slidePadPct}%`,
        boxSizing: "border-box",
        background: preset.bg,
        color: preset.ink,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: hasRightPanel ? "54% 42%" : "1fr",
          gap: "4%",
          alignItems: "center",
          flex: 1,
          minHeight: 0,
          marginTop: "5%",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: hasRightPanel ? sp(4.2, 26, 62) : sp(5.2, 32, 78),
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              margin: 0,
              maxWidth: hasRightPanel ? "100%" : "76%",
            }}
          >
            {getSlideTitle(slide, index)}
          </h1>

          {subtitle && (
            <p
              style={{
                fontSize: sp(1.8, 15, 26),
                lineHeight: 1.35,
                color: preset.accent,
                margin: "4% 0 0",
                maxWidth: hasRightPanel ? "100%" : "63%",
              }}
            >
              {subtitle}
            </p>
          )}

          {!subtitle && bullets.length > 0 && (
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                margin: "5% 0 0",
                display: "grid",
                gap: sp(1.2, 8, 16),
                maxWidth: hasRightPanel ? "100%" : "68%",
              }}
            >
              {bullets.map((item, bulletIndex) => (
                <li
                  key={`${item}-${bulletIndex}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: `${Math.round(34 * layoutUnit)}px 1fr`,
                    gap: Math.round(14 * layoutUnit),
                    alignItems: "baseline",
                    fontSize: sp(1.65, 14, 23),
                    lineHeight: 1.36,
                  }}
                >
                  <span style={{ color: preset.accent, fontFamily: "var(--font-mono)", fontSize: "0.68em", fontWeight: 700 }}>
                    {getSlideBulletMarker(slide, bulletIndex)}
                  </span>
                  <span>{String(item)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {hasRightPanel && (
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {chart ? (
              <div style={{ width: Math.round(W * 0.4), height: Math.round(H * 0.72), display: "flex", alignItems: "flex-end", gap: Math.max(3, Math.round(8 * layoutUnit)) }}>
                {chart.data.slice(0, 7).map((point, i) => {
                  const maxV = Math.max(...chart.data.map((d) => d.value), 0.001);
                  const barH = Math.max(2, (Number(point.value) / maxV) * Math.round(H * 0.62));
                  return <div key={i} style={{ flex: 1, height: barH, background: preset.accent, borderRadius: Math.round(4 * layoutUnit), opacity: 0.75, alignSelf: "flex-end" }} />;
                })}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5%", width: "100%" }}>
                {stats.map((stat, statIndex) => (
                  <div key={`${stat.value || stat.label}-${statIndex}`} style={{ borderTop: `3px solid ${preset.accent}`, paddingTop: "12%", minHeight: Math.round(110 * layoutUnit) }}>
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: sp(4.5, 28, 56),
                        fontWeight: 750,
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                      }}
                    >
                      {stat.value}
                    </div>
                    <div style={{ marginTop: Math.round(8 * layoutUnit), fontSize: sp(1.2, 12, 17), lineHeight: 1.3, opacity: 0.72 }}>
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
