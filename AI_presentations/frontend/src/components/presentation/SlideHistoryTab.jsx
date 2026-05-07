import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/design";
import { DeckSlideThumbCanvas } from "@/lib/slidePreview";
import {
  VERSION_SOURCE_LABELS,
  formatVersionTime,
  versionsForDisplay,
} from "@/lib/slideHistory";

function MiniThumb({ slide, slideIndex, total, preset }) {
  return (
    <div
      style={{
        width: 56,
        height: 32,
        borderRadius: 6,
        overflow: "hidden",
        flexShrink: 0,
        boxShadow: "0 0 0 1px rgba(15,31,58,.12)",
        background: "var(--surface-2)",
      }}
    >
      <DeckSlideThumbCanvas slide={slide} index={slideIndex} total={total} preset={preset} />
    </div>
  );
}

function CompareOverlay({ open, leftSlide, rightSlide, slideIndex, total, preset, leftLabel, rightLabel, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Сравнение версий"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "rgba(15,23,42,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          width: "100%",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--line)",
          padding: 14,
          boxShadow: "0 24px 64px rgba(15,23,42,.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>Сравнение с текущей</div>
          <button type="button" className="su-btn su-btn-outline" style={{ fontSize: 12 }} onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { slide: leftSlide, label: leftLabel },
            { slide: rightSlide, label: rightLabel },
          ].map((col) => (
            <div key={col.label}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 8 }}>{col.label}</div>
              <div
                style={{
                  borderRadius: 10,
                  overflow: "hidden",
                  border: "1px solid var(--line)",
                  aspectRatio: "16 / 9",
                  background: "var(--surface-2)",
                }}
              >
                <DeckSlideThumbCanvas slide={col.slide} index={slideIndex} total={total} preset={preset} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Вкладка «История слайда»: карточки версий, сравнение, локальный ИИ.
 */
export function SlideHistoryTab({
  slideIndex,
  slidesLen,
  onSlideIndexChange,
  versionsChrono,
  currentSlide,
  preset,
  previewChronoIndex,
  onSetPreview,
  compareChronoIndex,
  onSetCompare,
  busy,
  onRestore,
  onDuplicate,
  publicView,
  localAiOpen,
  onToggleLocalAi,
  localAiMessages,
  onSendLocalAi,
  localAiBusy,
}) {
  const display = useMemo(() => versionsForDisplay(versionsChrono), [versionsChrono]);
  const [aiFocusChrono, setAiFocusChrono] = useState(0);
  const [draft, setDraft] = useState("");
  const listEndRef = useRef(null);

  useEffect(() => {
    if (!versionsChrono.length) {
      setAiFocusChrono(0);
      return;
    }
    setAiFocusChrono((prev) => Math.min(prev, versionsChrono.length - 1));
  }, [versionsChrono.length, slideIndex]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localAiMessages.length]);

  const compareLeft = compareChronoIndex != null ? versionsChrono[compareChronoIndex] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 650 }}>Слайд</span>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <button
            type="button"
            className="su-btn su-btn-outline"
            style={{ padding: "2px 8px", fontSize: 12, minWidth: 32 }}
            disabled={slideIndex <= 0 || busy}
            onClick={() => onSlideIndexChange(slideIndex - 1)}
            aria-label="Предыдущий слайд"
          >
            ‹
          </button>
          <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", minWidth: 52, textAlign: "center" }}>
            {slideIndex + 1} / {slidesLen}
          </span>
          <button
            type="button"
            className="su-btn su-btn-outline"
            style={{ padding: "2px 8px", fontSize: 12, minWidth: 32 }}
            disabled={slideIndex >= slidesLen - 1 || busy}
            onClick={() => onSlideIndexChange(slideIndex + 1)}
            aria-label="Следующий слайд"
          >
            ›
          </button>
        </div>
      </div>

      {!versionsChrono.length ? (
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>История появится после первого сохранения версии.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 220, overflowY: "auto", paddingRight: 2 }}>
          {display.map((entry) => {
            const isPreview = previewChronoIndex === entry._chronoIndex;
            const isAiCtx = aiFocusChrono === entry._chronoIndex;
            return (
              <div
                key={`${entry.at}-${entry.versionNumber}`}
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "stretch",
                  padding: 8,
                  borderRadius: 10,
                  border: `1px solid ${isPreview || isAiCtx ? "color-mix(in srgb, var(--accent) 45%, var(--line))" : "var(--line)"}`,
                  background: isPreview ? "rgba(37,99,235,.06)" : "var(--surface-2)",
                }}
              >
                <MiniThumb slide={entry.slide} slideIndex={slideIndex} total={slidesLen} preset={preset} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>
                      v{entry.versionNumber}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{formatVersionTime(entry.at)}</span>
                    <span style={{ fontSize: 10, color: "var(--ink-3)" }}>
                      · {VERSION_SOURCE_LABELS[entry.source] || entry.source}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35 }}>{entry.summary}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 2 }}>
                    <button
                      type="button"
                      style={miniActionStyle}
                      disabled={busy || publicView}
                      onClick={() => onSetPreview(isPreview ? null : entry._chronoIndex)}
                    >
                      {isPreview ? "Снять просмотр" : "Просмотреть"}
                    </button>
                    <button
                      type="button"
                      style={miniActionStyle}
                      disabled={busy || publicView}
                      onClick={() => onSetCompare(entry._chronoIndex)}
                    >
                      Сравнить
                    </button>
                    <button
                      type="button"
                      style={miniActionStyle}
                      disabled={busy || publicView}
                      onClick={() => onRestore(entry._chronoIndex)}
                    >
                      Восстановить
                    </button>
                    <button
                      type="button"
                      style={miniActionStyle}
                      disabled={busy || publicView}
                      onClick={() => onDuplicate(entry._chronoIndex)}
                    >
                      Дублировать
                    </button>
                    {!publicView ? (
                      <button
                        type="button"
                        style={{ ...miniActionStyle, borderColor: "color-mix(in srgb, var(--accent) 35%, var(--line))", color: "var(--accent)" }}
                        disabled={busy}
                        onClick={() => {
                          setAiFocusChrono(entry._chronoIndex);
                          onToggleLocalAi(true);
                        }}
                      >
                        ИИ
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!publicView ? (
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
          <button
            type="button"
            className="su-btn su-btn-outline"
            style={{ width: "100%", fontSize: 12, marginBottom: 8 }}
            disabled={busy}
            onClick={() => onToggleLocalAi(!localAiOpen)}
          >
            <Icon name="sparkles" size={14} style={{ marginRight: 6, opacity: 0.85 }} />
            {localAiOpen ? "Скрыть ИИ по слайду" : "ИИ для этого слайда"}
          </button>

          {localAiOpen ? (
            <div
              style={{
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--surface-2)",
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                maxHeight: 280,
              }}
            >
              <div style={{ fontSize: 10, color: "var(--ink-3)", lineHeight: 1.4 }}>
                Контекст: только слайд {slideIndex + 1}
                {versionsChrono[aiFocusChrono] ? `, версия v${aiFocusChrono + 1}` : ""}. Глобальный чат в разделе «ИИ презентации».
              </div>
              <div style={{ fontSize: 10, color: "var(--ink-3)" }}>Выберите версию карточкой «ИИ» или листайте историю выше.</div>
              <div
                style={{
                  flex: 1,
                  minHeight: 72,
                  maxHeight: 120,
                  overflowY: "auto",
                  fontSize: 11,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                {localAiMessages.length === 0 ? (
                  <span style={{ color: "var(--ink-4)" }}>Например: «Сделай заголовок короче» или «Объясни, что изменилось между этой версией и текущей».</span>
                ) : (
                  localAiMessages.map((m, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "94%",
                        padding: "6px 8px",
                        borderRadius: 8,
                        background: m.role === "user" ? "rgba(37,99,235,.12)" : "var(--surface)",
                        border: "1px solid var(--line)",
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.35,
                      }}
                    >
                      {m.text}
                    </div>
                  ))
                )}
                <span ref={listEndRef} />
              </div>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Запрос к ИИ…"
                rows={2}
                disabled={localAiBusy || busy}
                style={{
                  width: "100%",
                  resize: "none",
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--line)",
                  padding: 8,
                  background: "var(--surface)",
                  color: "var(--ink)",
                  fontFamily: "inherit",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    const t = draft.trim();
                    if (!t || localAiBusy || busy) return;
                    void onSendLocalAi(t, aiFocusChrono);
                    setDraft("");
                  }
                }}
              />
              <button
                type="button"
                className="su-btn su-btn-accent"
                style={{ fontSize: 12, width: "100%" }}
                disabled={localAiBusy || busy || !draft.trim()}
                onClick={() => {
                  const t = draft.trim();
                  if (!t) return;
                  void onSendLocalAi(t, aiFocusChrono);
                  setDraft("");
                }}
              >
                {localAiBusy ? "Идёт запрос…" : "Отправить"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <CompareOverlay
        open={compareChronoIndex != null && compareLeft}
        leftSlide={compareLeft?.slide}
        rightSlide={currentSlide}
        slideIndex={slideIndex}
        total={slidesLen}
        preset={preset}
        leftLabel={compareLeft ? `Версия v${compareChronoIndex + 1}` : ""}
        rightLabel="Текущая версия"
        onClose={() => onSetCompare(null)}
      />
    </div>
  );
}

const miniActionStyle = {
  fontSize: 10,
  padding: "3px 7px",
  borderRadius: 6,
  border: "1px solid var(--line)",
  background: "var(--surface)",
  color: "var(--ink-2)",
  cursor: "pointer",
};
