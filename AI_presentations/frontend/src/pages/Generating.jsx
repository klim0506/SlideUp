import { useEffect, useRef, useState } from "react";
import { Icon, SlideThumb, accentForTheme } from "@/lib/design";
import { apiJson, navigate } from "@/lib/api";

const STEPS = [
  { id: "outline", label: "Собираем структуру" },
  { id: "content", label: "Пишем текст слайдов" },
  { id: "design", label: "Применяем выбранный стиль" },
  { id: "finalize", label: "Готовим просмотр и экспорт" },
];

export default function Generating() {
  const [stepIndex, setStepIndex] = useState(0);
  const [thumbs, setThumbs] = useState([]);
  const [error, setError] = useState("");
  const [config, setConfig] = useState(null);
  const calledRef = useRef(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("genConfig");
    if (!raw) {
      navigate("/");
      return;
    }
    try {
      setConfig(JSON.parse(raw));
    } catch {
      navigate("/");
    }
  }, []);

  useEffect(() => {
    if (!config || calledRef.current) return;
    calledRef.current = true;
    runGeneration(config);
  }, [config]);

  async function runGeneration(cfg) {
    const timer = setInterval(() => {
      setStepIndex((current) => {
        if (current < STEPS.length - 1) return current + 1;
        clearInterval(timer);
        return current;
      });
    }, 1800);

    try {
      const data = await apiJson("/api/generate/", {
        method: "POST",
        body: JSON.stringify({
          prompt: cfg.prompt,
          slides_count: cfg.slides_count || cfg.slideCount || 5,
          theme: cfg.theme || "light",
          style: cfg.style || "pitch",
        }),
      });

      clearInterval(timer);
      setStepIndex(STEPS.length - 1);
      if (data.slides?.length) {
        setThumbs(data.slides.slice(0, 6));
        await delay(800);
      }
      sessionStorage.removeItem("genConfig");
      navigate(`/presentation/${data.id}`);
    } catch (err) {
      clearInterval(timer);
      setError(err.message || "Пока не получилось создать презентацию — загляните чуть позже или попробуйте снова.");
    }
  }

  const accent = accentForTheme(config?.theme);

  return (
    <div className="su-page" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 56 }}>
        <Icon name="logo" size={20} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 17, fontWeight: 750, color: "var(--ink)", letterSpacing: "-0.01em" }}>SlideUp</span>
      </div>

      {error ? (
        <div style={{ textAlign: "center", maxWidth: 460 }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--accent-soft)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <Icon name="x" size={24} style={{ color: "var(--ink-3)" }} />
          </div>
          <h2 style={{ fontSize: 26, fontWeight: 760, letterSpacing: "-0.03em", marginBottom: 12 }}>Пока не получилось</h2>
          <p style={{ color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>{error}</p>
          <button onClick={() => navigate("/")} className="su-btn su-btn-primary" style={{ padding: "12px 24px" }}>
            Вернуться и попробовать снова
          </button>
        </div>
      ) : (
        <div style={{ width: "100%", maxWidth: 540, textAlign: "center" }}>
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 30, fontWeight: 760, letterSpacing: "-0.035em", margin: "0 0 8px" }}>
              Создаём вашу презентацию
            </h2>
            {config?.prompt ? (
              <p style={{ color: "var(--ink-3)", fontSize: 14, margin: 0 }}>«{config.prompt}»</p>
            ) : null}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 44, textAlign: "left" }}>
            {STEPS.map((step, index) => {
              const done = index < stepIndex;
              const active = index === stepIndex;
              return (
                <div key={step.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: active ? "var(--surface)" : "transparent", border: `1px solid ${active ? "var(--line)" : "transparent"}`, borderRadius: "var(--r-md)", boxShadow: active ? "var(--sh-sm)" : "none", transition: "all 300ms var(--ease)" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: done ? "var(--accent)" : active ? "var(--surface-2)" : "transparent", border: `2px solid ${done || active ? "var(--accent)" : "var(--line-2)"}` }}>
                    {done ? <Icon name="check" size={12} style={{ color: "#fff" }} /> : active ? <SpinDot /> : null}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? "var(--ink)" : done ? "var(--ink-2)" : "var(--ink-4)" }}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {thumbs.length > 0 ? (
            <div style={{ display: "flex", gap: 8, justifyContent: "center", animation: "fadeIn 400ms var(--ease) both" }}>
              {thumbs.map((slide, index) => (
                <div key={index} style={{ width: 72, borderRadius: "var(--r-sm)", overflow: "hidden", border: "1px solid var(--line)" }}>
                  <SlideThumb
                    slide={slide}
                    accent={accent}
                    theme={config?.theme || "light"}
                    slideIndex={index}
                    slideTotal={Math.max(thumbs.length, index + 1)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ marginTop: 40, height: 3, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "var(--accent)", borderRadius: 99, width: `${((stepIndex + 1) / STEPS.length) * 100}%`, transition: "width 600ms var(--ease)" }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-3)" }}>
            Шаг {stepIndex + 1} из {STEPS.length}
          </div>
        </div>
      )}
    </div>
  );
}

function SpinDot() {
  return <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)", animation: "pulse 900ms ease infinite" }} />;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
