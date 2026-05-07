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

export function getSlideStats(slide) {
  if (Array.isArray(slide?.stats)) return slide.stats;
  if (Array.isArray(slide?.content?.stats)) return slide.content.stats;
  return [];
}

/** 16:9 miniature matching viewer thumbnails — uses theme preset colors. */
export function DeckSlideThumbCanvas({ slide, index, total, preset }) {
  const bullets = getSlideBullets(slide).slice(0, 4);
  const stats = getSlideStats(slide).slice(0, 4);
  const subtitle = getSlideSubtitle(slide);
  const hasListContent = !subtitle && bullets.length > 0;

  return (
    <div
      style={{
        aspectRatio: "16 / 9",
        width: "100%",
        borderRadius: 8,
        background: preset.bg,
        color: preset.ink,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${preset.ink}1f`,
      }}
    >
      <div style={{ position: "absolute", inset: 0, padding: "7% 8%", display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: hasListContent ? 3 : 7,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {slide?.icon ? (
              <span style={{ fontSize: 7, lineHeight: 1, userSelect: "none" }}>{slide.icon}</span>
            ) : (
              <div style={{ width: "22%", height: 3, borderRadius: 99, background: preset.accent }} />
            )}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 5.5, lineHeight: 1, opacity: 0.45 }}>
            {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
          </div>
        </div>

        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: hasListContent ? 7 : 10,
            fontWeight: 760,
            lineHeight: 1.05,
            letterSpacing: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flexShrink: 0,
          }}
        >
          {getSlideTitle(slide, index)}
        </div>

        {subtitle && (
          <div style={{ marginTop: 4, color: preset.accent, fontSize: 5.5, lineHeight: 1.2, maxHeight: 14, overflow: "hidden" }}>
            {subtitle}
          </div>
        )}

        {hasListContent && (
          <div style={{ marginTop: 4, display: "grid", gap: 1, minHeight: 0, overflow: "hidden" }}>
            {bullets.map((item, bulletIndex) => (
              <div
                key={`${item}-${bulletIndex}`}
                style={{ display: "grid", gridTemplateColumns: "9px 1fr", gap: 3, alignItems: "baseline", minWidth: 0 }}
              >
                <span style={{ color: preset.accent, fontFamily: "var(--font-mono)", fontSize: 4.5, lineHeight: "6px", fontWeight: 800 }}>
                  {String(bulletIndex + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 4.8, lineHeight: "6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {String(item)}
                </span>
              </div>
            ))}
          </div>
        )}

        {slide?.chart && Array.isArray(slide.chart.data) && slide.chart.data.length >= 2 ? (
          <div style={{ marginTop: "auto", display: "flex", alignItems: "flex-end", gap: 1.5, height: 14, paddingTop: 2 }}>
            {slide.chart.data.slice(0, 7).map((point, i) => {
              const maxV = Math.max(...slide.chart.data.map((d) => d.value), 0.001);
              const barH = Math.max(2, (point.value / maxV) * 12);
              return (
                <div key={i} style={{ flex: 1, background: preset.accent, borderRadius: 1, height: barH, opacity: 0.75, alignSelf: "flex-end" }} />
              );
            })}
          </div>
        ) : stats.length > 0 ? (
          <div style={{ marginTop: "auto", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 3 }}>
            {stats.map((stat, statIndex) => (
              <div key={`${stat.value || stat.label}-${statIndex}`} style={{ borderTop: `1px solid ${preset.accent}`, paddingTop: 2, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 7,
                    fontWeight: 760,
                    lineHeight: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {stat.value}
                </div>
                <div style={{ marginTop: 1, fontSize: 4.5, lineHeight: 1.1, opacity: 0.62, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
