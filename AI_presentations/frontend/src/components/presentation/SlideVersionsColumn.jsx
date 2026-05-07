import { useRef, useState } from "react";
import { Icon } from "@/lib/design";
import { DeckSlideThumbCanvas } from "@/lib/slidePreview";

function VersionCard({ entry, isNewest, busy, slideIndex, total, preset, onClick }) {
  return (
    <div
      onClick={onClick}
      title={`v${entry.versionNumber}${entry.summary ? " — " + entry.summary : ""}${isNewest ? " (текущая)" : " — нажмите, чтобы восстановить"}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        cursor: isNewest ? "default" : busy ? "not-allowed" : "pointer",
        borderRadius: 7,
        padding: "3px 3px 2px",
        border: isNewest ? "1.5px solid var(--accent)" : "1px solid var(--line)",
        background: isNewest ? "rgba(37,99,235,.07)" : "var(--surface-2)",
        transition: "border-color 0.12s",
        flexShrink: 0,
        opacity: busy && !isNewest ? 0.6 : 1,
      }}
    >
      <div style={{ width: 56, height: 32, borderRadius: 4, overflow: "hidden" }}>
        <DeckSlideThumbCanvas slide={entry.slide} index={slideIndex} total={total} preset={preset} />
      </div>
      <span
        style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          fontWeight: isNewest ? 800 : 600,
          color: isNewest ? "var(--accent)" : "var(--ink-3)",
          lineHeight: 1,
        }}
      >
        v{entry.versionNumber}
      </span>
    </div>
  );
}

/**
 * Left-column version strip: oldest at top, newest at bottom (highlighted).
 * Below cards: sparkles button opens a floating reprompt popover.
 */
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
}) {
  const [aiOpen, setAiOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const btnRef = useRef(null);

  const entries = versionsChrono.map((entry, i) => ({
    ...entry,
    versionNumber: i + 1,
    _chronoIndex: i,
  }));

  const newestIndex = versionsChrono.length - 1;

  function handleSend() {
    const t = draft.trim();
    if (!t || localAiBusy || busy) return;
    void onSendAi(t, newestIndex >= 0 ? newestIndex : 0);
    setDraft("");
    setAiOpen(false);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        flexShrink: 0,
        gap: 4,
        width: 68,
        position: "relative",
      }}
    >
      {/* Cards: oldest at top → newest at bottom */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          overflowY: "auto",
          maxHeight: "calc(100% - 44px)",
          alignItems: "center",
          width: "100%",
          paddingBottom: 2,
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              width: 56,
              height: 32,
              borderRadius: 7,
              border: "1px dashed var(--line)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: 0.45,
            }}
            title="Нет сохранённых версий"
          >
            <Icon name="layers" size={13} />
          </div>
        ) : (
          entries.map((entry) => {
            const isNewest = entry._chronoIndex === newestIndex;
            return (
              <VersionCard
                key={`${entry.at}-${entry.versionNumber}`}
                entry={entry}
                isNewest={isNewest}
                busy={busy}
                slideIndex={slideIndex}
                total={slidesLen}
                preset={preset}
                onClick={() => {
                  if (!publicView && !isNewest && !busy && onActivate) {
                    onActivate(entry._chronoIndex);
                  }
                }}
              />
            );
          })
        )}
      </div>

      {/* Reprompt button */}
      {!publicView ? (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <button
            ref={btnRef}
            type="button"
            title="Допромптить слайд через ИИ"
            onClick={() => setAiOpen((o) => !o)}
            disabled={busy || localAiBusy}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: aiOpen ? "1.5px solid var(--accent)" : "1px solid var(--line)",
              background: aiOpen ? "rgba(37,99,235,.08)" : "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: busy || localAiBusy ? "not-allowed" : "pointer",
              color: localAiBusy ? "var(--ink-4)" : aiOpen ? "var(--accent)" : "var(--ink-3)",
              opacity: busy || localAiBusy ? 0.6 : 1,
              transition: "border-color 0.12s, background 0.12s",
            }}
          >
            {localAiBusy ? (
              <Icon name="loader" size={13} />
            ) : (
              <Icon name="sparkles" size={13} />
            )}
          </button>

          {aiOpen ? (
            <div
              style={{
                position: "absolute",
                left: "calc(100% + 10px)",
                bottom: 0,
                zIndex: 60,
                width: 220,
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 10,
                padding: 10,
                boxShadow: "0 8px 32px rgba(15,23,42,.18)",
                display: "flex",
                flexDirection: "column",
                gap: 7,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--ink-3)", lineHeight: 1.4 }}>
                Перегенерировать слайд {slideIndex + 1}
                {newestIndex >= 0 ? ` (основа: v${newestIndex + 1})` : ""}
              </div>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Что изменить? (Ctrl+Enter — отправить)"
                rows={3}
                disabled={localAiBusy || busy}
                style={{
                  width: "100%",
                  resize: "none",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  padding: "6px 8px",
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSend();
                  }
                  if (e.key === "Escape") setAiOpen(false);
                }}
              />
              <div style={{ display: "flex", gap: 5 }}>
                <button
                  type="button"
                  className="su-btn su-btn-accent"
                  style={{ flex: 1, fontSize: 11 }}
                  disabled={localAiBusy || busy || !draft.trim()}
                  onClick={handleSend}
                >
                  {localAiBusy ? "Генерирую…" : "Отправить"}
                </button>
                <button
                  type="button"
                  className="su-btn su-btn-outline"
                  style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={() => setAiOpen(false)}
                >
                  ✕
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
