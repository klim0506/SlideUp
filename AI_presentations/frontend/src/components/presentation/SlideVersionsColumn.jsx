import { Icon } from "@/lib/design";
import { DeckSlideThumbCanvas } from "@/lib/slidePreview";

function VersionThumb({
  slide,
  slideIndex,
  total,
  preset,
  active,
  onClick,
  children,
  title,
  disabled = false,
  fadeWhenInactive = true,
  versionLabel = "",
}) {
  const inactiveDim = fadeWhenInactive && !active;
  const opacity = active ? 1 : disabled ? 0.42 : inactiveDim ? 0.5 : 1;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 68,
        flexShrink: 0,
        padding: 0,
        border: active ? "1px solid color-mix(in srgb, var(--accent) 28%, var(--line))" : "1px solid transparent",
        borderRadius: 10,
        background: active ? "var(--surface)" : "transparent",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity,
        boxShadow: active ? "0 0 0 2px color-mix(in srgb, var(--accent) 10%, transparent)" : "none",
        position: "relative",
      }}
    >
      <div style={{ width: 68, height: 40, borderRadius: 9, overflow: "hidden", boxShadow: "0 0 0 1px rgba(32,33,36,.08)" }}>
        {children || <DeckSlideThumbCanvas slide={slide} index={slideIndex} total={total} preset={preset} />}
      </div>
      {versionLabel ? (
        <span
          style={{
            position: "absolute",
            top: -5,
            left: -2,
            padding: "1px 6px",
            borderRadius: 999,
            border: "1px solid color-mix(in srgb, var(--line) 82%, white)",
            background: active ? "var(--accent)" : "rgba(255,255,255,.94)",
            color: active ? "white" : "var(--ink-3)",
            fontFamily: "var(--font-mono)",
            fontSize: 9.5,
            fontWeight: 700,
            lineHeight: 1.25,
            pointerEvents: "none",
          }}
        >
          {versionLabel}
        </span>
      ) : null}
    </button>
  );
}

export function SlideVersionsColumn({
  versionsChrono,
  slideIndex,
  slidesLen,
  preset,
  onActivate,
  onPromptAi,
  localAiBusy,
  busy,
  publicView,
  variant = "below",
}) {
  const newestIndex = versionsChrono.length - 1;
  const isBelow = variant === "below";

  const aiThumb = !publicView ? (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <VersionThumb
        active={false}
        fadeWhenInactive={false}
        disabled={busy || localAiBusy}
        onClick={() => {
          if (!busy && !localAiBusy) onPromptAi?.(newestIndex >= 0 ? newestIndex : 0);
        }}
        title="Подставить промпт для нового варианта"
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.96))",
            color: localAiBusy ? "var(--ink-4)" : "var(--accent)",
          }}
        >
          <Icon name={localAiBusy ? "loader" : "refresh-cw"} size={18} />
        </div>
      </VersionThumb>
    </div>
  ) : null;

  const versionItems = versionsChrono.map((entry, i) => {
    const active = i === newestIndex;
    return (
      <VersionThumb
        key={`${entry.at}-${i}`}
        slide={entry.slide}
        slideIndex={slideIndex}
        total={slidesLen}
        preset={preset}
        active={active}
        disabled={busy || active}
        title={`Версия v${i + 1}`}
        versionLabel={`v${i + 1}`}
        onClick={() => {
          if (!publicView && !active && !busy && onActivate) onActivate(i);
        }}
      />
    );
  });

  const strip = (
    <div
      style={{
        display: "flex",
        flexDirection: isBelow ? "row" : "column",
        alignItems: "center",
        justifyContent: isBelow ? "center" : undefined,
        width: isBelow ? "100%" : undefined,
        minWidth: isBelow ? 0 : undefined,
        gap: 8,
        overflowX: isBelow ? "auto" : "hidden",
        overflowY: isBelow ? "hidden" : "auto",
        padding: 0,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {versionItems}
      {aiThumb}
    </div>
  );

  if (isBelow) {
    return (
      <div
        style={{
          flexShrink: 0,
          width: "100%",
          marginTop: 8,
          paddingTop: 8,
          minWidth: 0,
        }}
      >
        {strip}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        width: 76,
      }}
    >
      {strip}
    </div>
  );
}
