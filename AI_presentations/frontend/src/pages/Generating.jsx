import { useEffect, useRef, useState } from "react";
import { Icon, SlideThumb, accentForTheme } from "@/lib/design";
import { apiJson, createBlankPresentation, navigate } from "@/lib/api";
import { LEGACY_GEN_CONFIG_KEY, genConfigKey, setPendingSource, takePendingSource } from "@/lib/genHandoff";

const PHASES = [
  { id: "outline", label: "Структура" },
  { id: "content", label: "Текст" },
  { id: "design", label: "Стиль" },
  { id: "finalize", label: "Финал" },
];

const TICKER_LINES = [
  "Раскладываем рассказ по слайдам",
  "Сжимаем суть в короткие, ёмкие тезисы",
  "Ищем точные формулировки",
  "Подбираем визуальный ритм",
  "Сверяем тон с выбранным стилем",
  "Чистим перегруженные места",
  "Думаем за зрителя — что он унесёт с собой",
];

const FILE_TICKER_PREFIX = "Читаем ваш файл и достаём суть";

export function PresentationGeneratingState({ presentationId = null, initialConfig = null, onGenerated = null, onCancel = null, onUpgrade = null }) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [thumbs, setThumbs] = useState([]);
  const [error, setError] = useState("");
  const [config, setConfig] = useState(null);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceMeta, setSourceMeta] = useState(null);
  const [tickerIndex, setTickerIndex] = useState(0);
  const [done, setDone] = useState(false);
  const calledRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    setConfig(initialConfig || null);
    setError("");
    setDone(false);
    setThumbs([]);
    setPhaseIndex(0);
    setTickerIndex(0);
    calledRef.current = false;
    startedAtRef.current = Date.now();
    const handoff = takePendingSource(presentationId);
    setSourceFile(handoff.file);
    setSourceMeta(handoff.meta);
  }, [initialConfig, presentationId]);

  useEffect(() => {
    if (!config || calledRef.current) return;
    calledRef.current = true;
    runGeneration(config, sourceFile);
  }, [config, sourceFile]);

  // Keep advancing phases up to the last one while we wait. The final tick to "done"
  // happens only when the API actually responds — phases 0..N-1 drift on a timer
  // so users see momentum, but the last phase locks until reality catches up.
  useEffect(() => {
    if (error || done) return undefined;
    const timer = setInterval(() => {
      setPhaseIndex((p) => (p < PHASES.length - 1 ? p + 1 : p));
    }, 2400);
    return () => clearInterval(timer);
  }, [error, done]);

  useEffect(() => {
    if (error || done) return undefined;
    const timer = setInterval(() => {
      setTickerIndex((i) => (i + 1) % TICKER_LINES.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [error, done]);

  async function runGeneration(cfg, file) {
    try {
      const slidesCount = cfg.slides_count || cfg.slideCount || 5;
      const targetId = cfg.presentation_id || presentationId;
      if (!file && cfg.source_file_name) {
        throw new Error("После обновления страницы файл уже недоступен. Вернитесь назад и прикрепите его ещё раз.");
      }
      let response;
      if (file) {
        const fd = new FormData();
        fd.append("prompt", cfg.prompt || "");
        fd.append("slides_count", String(slidesCount));
        fd.append("theme", cfg.theme || "light");
        fd.append("style", cfg.style || "pitch");
        if (targetId) fd.append("presentation_id", String(targetId));
        fd.append("source_file", file);
        response = await apiJson("/api/generate/", { method: "POST", body: fd });
      } else {
        response = await apiJson("/api/generate/", {
          method: "POST",
          body: JSON.stringify({
            prompt: cfg.prompt,
            slides_count: slidesCount,
            theme: cfg.theme || "light",
            style: cfg.style || "pitch",
            presentation_id: targetId,
          }),
        });
      }

      setPhaseIndex(PHASES.length - 1);
      if (response.slides?.length) {
        setThumbs(response.slides.slice(0, 6));
      }
      setDone(true);

      // Honor a minimum on-screen time so the experience doesn't flash on fast responses.
      const elapsed = Date.now() - startedAtRef.current;
      const minVisible = 2400;
      if (elapsed < minVisible) {
        await delay(minVisible - elapsed);
      }

      if (targetId) sessionStorage.removeItem(genConfigKey(targetId));
      sessionStorage.removeItem(LEGACY_GEN_CONFIG_KEY);
      if (onGenerated) {
        onGenerated(response);
      } else {
        navigate(`/presentation/${response.id}`);
      }
    } catch (err) {
      if (err?.status === 429 || err?.data?.show_upsell) onUpgrade?.(err);
      setError(err.message || "Пока не получилось создать презентацию — загляните чуть позже или попробуйте снова.");
    }
  }

  function retryGeneration() {
    if (!config) return;
    setError("");
    setDone(false);
    setThumbs([]);
    setPhaseIndex(0);
    setTickerIndex(0);
    startedAtRef.current = Date.now();
    calledRef.current = true;
    void runGeneration(config, sourceFile);
  }

  if (error) {
    return (
      <div className="su-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 56 }}>
          <Icon name="logo" size={20} style={{ color: "var(--accent)" }} />
          <span style={{ fontSize: 17, fontWeight: 750, color: "var(--ink)", letterSpacing: "-0.01em" }}>SlideUp</span>
        </div>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--accent-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Icon name="x" size={24} style={{ color: "var(--ink-3)" }} />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 760, letterSpacing: "-0.03em", marginBottom: 12 }}>Пока не получилось</h2>
          <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{error}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={retryGeneration} className="su-btn su-btn-primary" style={{ padding: "12px 24px" }}>
              Попробовать снова
            </button>
            <button onClick={() => (onCancel ? onCancel() : navigate("/"))} className="su-btn su-btn-outline" style={{ padding: "12px 24px" }}>
              Назад
            </button>
          </div>
        </div>
      </div>
    );
  }

  const visualPhase = done ? PHASES.length : phaseIndex;
  const accent = accentForTheme(config?.theme);
  const slidesCount = config?.slides_count || 5;
  const fileName = sourceFile?.name || sourceMeta?.name || config?.source_file_name || "";
  const tickerLine = done
    ? "Открываем презентацию…"
    : (sourceFile && phaseIndex === 0 ? FILE_TICKER_PREFIX : TICKER_LINES[tickerIndex]);

  return (
    <div className="su-page gen-magic-page">
      <div className="gen-magic-bg" aria-hidden="true">
        <div className="gen-magic-orb gen-magic-orb-a" />
        <div className="gen-magic-orb gen-magic-orb-b" />
      </div>

      <div className="gen-magic-shell">
        <div className="gen-magic-brand">
          <span className="gen-magic-brand-aura" aria-hidden="true" />
          <Icon name="logo" size={22} style={{ color: "var(--accent)", position: "relative", zIndex: 1 }} />
          <span style={{ fontSize: 16, fontWeight: 750, letterSpacing: "-0.01em", position: "relative", zIndex: 1 }}>SlideUp</span>
        </div>

        <div className="gen-magic-headline">
          <h1 className="gen-magic-title">Создаём вашу презентацию</h1>
          {config?.prompt ? (
            <p className="gen-magic-prompt">«{config.prompt}»</p>
          ) : null}
          {fileName ? (
            <div className="gen-magic-source">
              <Icon name="paperclip" size={12} stroke={2.2} />
              <span>{fileName}</span>
            </div>
          ) : null}
        </div>

        <MagicStage
          phase={Math.min(visualPhase, PHASES.length - 1)}
          done={done}
          thumbs={thumbs}
          accent={accent}
          theme={config?.theme || "light"}
          slideCount={slidesCount}
        />

        <div className="gen-magic-ticker" aria-live="polite">
          <span className="gen-magic-ticker-spark" aria-hidden="true" />
          <span key={tickerLine} className="gen-magic-ticker-line">{tickerLine}</span>
        </div>

        <div className="gen-magic-steps" role="list">
          {PHASES.map((step, index) => {
            const stepDone = done || index < visualPhase;
            const active = !done && index === visualPhase;
            return (
              <div
                key={step.id}
                role="listitem"
                className={`gen-magic-step${active ? " gen-magic-step--active" : ""}${stepDone ? " gen-magic-step--done" : ""}`}
              >
                <span className="gen-magic-step-bullet" aria-hidden="true">
                  {stepDone ? (
                    <Icon name="check" size={10} stroke={2.6} style={{ color: "var(--accent-fg)" }} />
                  ) : active ? (
                    <span className="gen-magic-step-dot" />
                  ) : null}
                </span>
                <span className="gen-magic-step-label">{step.label}</span>
              </div>
            );
          })}
        </div>

        <div className="gen-magic-bar" aria-hidden="true">
          <div
            className="gen-magic-bar-fill"
            style={{ width: `${(Math.min(visualPhase + 1, PHASES.length) / PHASES.length) * 100}%` }}
          />
          {!done ? <div className="gen-magic-bar-shimmer" /> : null}
        </div>
      </div>
    </div>
  );
}

export default function Generating() {
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function migrateLegacyGeneration() {
      const raw = sessionStorage.getItem(LEGACY_GEN_CONFIG_KEY);
      if (!raw) {
        navigate("/");
        return;
      }

      let cfg;
      try {
        cfg = JSON.parse(raw);
      } catch {
        sessionStorage.removeItem(LEGACY_GEN_CONFIG_KEY);
        navigate("/");
        return;
      }

      try {
        const deck = await createBlankPresentation({ theme: cfg.theme || "light" });
        if (cancelled) return;
        sessionStorage.setItem(
          genConfigKey(deck.id),
          JSON.stringify({
            ...cfg,
            presentation_id: deck.id,
          }),
        );
        const legacySource = takePendingSource();
        setPendingSource(deck.id, legacySource.file, legacySource.meta);
        sessionStorage.removeItem(LEGACY_GEN_CONFIG_KEY);
        navigate(`/presentation/${deck.id}`);
      } catch (err) {
        if (!cancelled) {
          setProblem(err?.message || "Не получилось подготовить генерацию. Попробуйте ещё раз.");
        }
      }
    }

    void migrateLegacyGeneration();
    return () => {
      cancelled = true;
    };
  }, []);

  if (problem) {
    return (
      <div className="su-page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{problem}</p>
          <button onClick={() => navigate("/")} className="su-btn su-btn-primary" style={{ padding: "12px 24px" }}>
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="su-page" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div className="gen-magic-brand">
        <span className="gen-magic-brand-aura" aria-hidden="true" />
        <Icon name="logo" size={22} style={{ color: "var(--accent)", position: "relative", zIndex: 1 }} />
        <span style={{ fontSize: 16, fontWeight: 750, letterSpacing: "-0.01em", position: "relative", zIndex: 1 }}>SlideUp</span>
      </div>
    </div>
  );
}

function MagicStage({ phase, done, thumbs, accent, theme, slideCount }) {
  const showThumbs = done && thumbs.length > 0;
  const placeholderTotal = Math.max(3, Math.min(6, Number(slideCount) || 5));
  return (
    <div className="gen-magic-stage" data-phase={phase} data-done={done ? "true" : "false"}>
      <div className="gen-magic-stage-glow" aria-hidden="true" />
      <div className="gen-magic-stage-scan" aria-hidden="true" />

      <div className={`gen-magic-stage-mock${showThumbs ? " is-fading" : ""}`} aria-hidden="true">
        <div className="gen-mock-accent" style={{ background: accent }} />

        <div className="gen-mock-eyebrow">
          <span style={{ background: accent, "--w": "14%" }} />
        </div>

        <div className="gen-mock-title">
          <span style={{ width: "62%" }} />
          <span style={{ width: "38%" }} />
        </div>

        <div className="gen-mock-bullets">
          {[0, 1, 2].map((i) => (
            <div key={i} className="gen-mock-bullet" style={{ animationDelay: `${0.5 + i * 0.18}s` }}>
              <span className="gen-mock-bullet-dot" style={{ background: accent }} />
              <span
                className="gen-mock-bullet-line"
                style={{
                  animationDelay: `${0.6 + i * 0.18}s`,
                  "--w": `${82 - i * 14}%`,
                }}
              />
            </div>
          ))}
        </div>

        <div className="gen-mock-foot">
          <span>SLIDEUP</span>
          <span className="gen-mock-foot-dots">
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ background: i === 0 ? accent : "currentColor" }} />
            ))}
          </span>
        </div>
      </div>

      <div className={`gen-magic-stage-thumbs${showThumbs ? " is-visible" : ""}`}>
        {showThumbs
          ? thumbs.map((slide, index) => (
              <div key={index} className="gen-magic-thumb" style={{ animationDelay: `${index * 70}ms` }}>
                <SlideThumb
                  slide={slide}
                  accent={accent}
                  theme={theme}
                  slideIndex={index}
                  slideTotal={Math.max(thumbs.length, placeholderTotal)}
                />
              </div>
            ))
          : null}
      </div>
    </div>
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
