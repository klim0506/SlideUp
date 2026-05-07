/** Helpers + miniature canvas for deck slides (shared by PresentationView and SlideThumb). */

export const DECK_SLIDE_TYPES = new Set(["title", "content", "two_column", "quote", "stats", "cta"]);

const PITCH_LAYOUT_KINDS = new Set(["cover", "two-column", "feature-grid", "metrics", "ask"]);

export function isGeneratedDeckSlide(slide) {
  if (!slide || typeof slide !== "object") return false;
  if (slide.kind && PITCH_LAYOUT_KINDS.has(slide.kind)) return false;
  if (slide.type && DECK_SLIDE_TYPES.has(slide.type)) return true;
  if (!slide.kind && typeof slide.title === "string" && slide.title.trim()) return true;
  return false;
}

export function getSlideTitle(slide, index) {
  return slide?.title || slide?.content?.title || `Слайд ${index + 1}`;
}

export function getSlideSubtitle(slide) {
  if (!slide) return "";
  if (typeof slide.subtitle === "string") return slide.subtitle;
  if (typeof slide.content?.subtitle === "string") return slide.content.subtitle;
  if (slide.type === "title" && typeof slide.content === "string") return slide.content;
  return "";
}

export function getSlideBullets(slide) {
  if (!slide) return [];
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
  if (Array.isArray(slide?.stats)) return slide.stats;
  if (Array.isArray(slide?.content?.stats)) return slide.content.stats;
  return [];
}

const PAGE_NUMBER_MODE_CORNER_BR = "corner_br";
const PAGE_NUMBER_MODE_CORNER_TR = "corner_tr";
const WATERMARK_MODE_CORNER_BR = "corner_br";
const WATERMARK_MODE_CORNER_TR = "corner_tr";

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
}) {
  const r = typeof cornerRadius === "number" && Number.isFinite(cornerRadius) && cornerRadius >= 0 ? cornerRadius : 8;
  const fs = typeof fontScale === "number" && Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const W = typeof slideWidth === "number" && Number.isFinite(slideWidth) && slideWidth > 0 ? slideWidth : 1200;
  const H = typeof slideHeight === "number" && Number.isFinite(slideHeight) && slideHeight > 0 ? slideHeight : Math.round((W * 9) / 16);
  const layoutUnit = (W / 1200) * fs;
  const bullets = getSlideBullets(slide).slice(0, 6);
  const stats = getSlideStats(slide).slice(0, 4);
  const subtitle = getSlideSubtitle(slide);
  const icon = typeof slide?.icon === "string" ? slide.icon.trim() : "";
  const chart = slide?.chart && Array.isArray(slide.chart.data) && slide.chart.data.length >= 2 ? slide.chart : null;
  const hasRightPanel = !!(chart || stats.length > 0);
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
  const chromeGap = Math.max(8, Math.round(10 * layoutUnit));

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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height="100%"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
        }}
      >
        <foreignObject x="0" y="0" width={W} height={H}>
          <div
            xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: W,
              height: H,
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
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5%", flexShrink: 0 }}
            >
              <div style={{ fontSize: sp(3.2, 20, 40), lineHeight: 1, userSelect: "none" }}>{icon || null}</div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: chromeGap,
                  pointerEvents: "none",
                  marginRight: `${pageCounterCornerExtraPct}%`,
                }}
              >
                {showWmTR ? <div style={{ ...chromeLabelStyle, color: preset.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>SlideUp</div> : null}
                {showCornerTR ? <div style={{ ...chromeLabelStyle, opacity: 0.48 }}>{pageCounterText}</div> : null}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: hasRightPanel ? "54% 42%" : "1fr",
                gap: "4%",
                alignItems: "center",
                flex: 1,
                minHeight: 0,
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

            {showCornerBR || showWmBR ? (
              <div
                style={{
                  position: "absolute",
                  right: `${pageCounterRightPct}%`,
                  bottom: `${slidePadPct}%`,
                  display: "flex",
                  flexDirection: "row",
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
        </foreignObject>
      </svg>
    </div>
  );
}
