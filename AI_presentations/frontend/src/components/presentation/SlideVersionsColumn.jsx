import { useRef, useState } from "react";
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
      }}
    >
      <div style={{ width: 68, height: 40, borderRadius: 9, overflow: "hidden", boxShadow: "0 0 0 1px rgba(32,33,36,.08)" }}>
        {children || <DeckSlideThumbCanvas slide={slide} index={slideIndex} total={total} preset={preset} />}
      </div>
    </button>
  );
}

export function SlideVersionsColumn({
  versionsChrono,
  slideIndex,
  slidesLen,
  preset,
  onActivate,
  onSendAi,
  localAiBusy,
  busy,
  publicView,
  variant = "below",
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const newestIndex = versionsChrono.length - 1;
  const isBelow = variant === "below";
  const btnRef = useRef(null);

  function handleSend() {
    const text = draft.trim();
    if (!text || localAiBusy || busy) return;
    void onSendAi(text, newestIndex >= 0 ? newestIndex : 0);
    setDraft("");
    setAiOpen(false);
  }

  const aiThumb = !publicView ? (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <VersionThumb
        active={aiOpen}
        fadeWhenInactive={false}
        disabled={busy || localAiBusy}
        onClick={() => setAiOpen((v) => !v)}
        title="Новый вариант с помощью ИИ"
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
          <Icon name={localAiBusy ? "loader" : "sparkles"} size={18} />
        </div>
      </VersionThumb>

      {aiOpen ? (
        <div
          style={{
            position: "absolute",
            zIndex: 60,
            right: 0,
            bottom: "calc(100% + 8px)",
            width: 260,
            background: "rgba(255,255,255,.97)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            padding: 10,
            boxShadow: "0 12px 36px rgba(32,33,36,.14)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            backdropFilter: "blur(12px)",
          }}
        >
          <textarea
            ref={btnRef}
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Что изменить?"
            rows={3}
            disabled={busy || localAiBusy}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "none",
              minHeight: 72,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 12,
              fontFamily: "inherit",
              color: "var(--ink)",
              background: "var(--surface)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === "Escape") setAiOpen(false);
            }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              className="su-btn su-btn-accent"
              style={{ flex: 1, fontSize: 12 }}
              disabled={busy || localAiBusy || !draft.trim()}
              onClick={handleSend}
            >
              {localAiBusy ? "Генерирую..." : "Создать вариант"}
            </button>
            <button
              type="button"
              className="su-btn su-btn-outline"
              style={{ fontSize: 12, padding: "4px 10px" }}
              onClick={() => setAiOpen(false)}
            >
              Закрыть
            </button>
          </div>
        </div>
      ) : null}
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
