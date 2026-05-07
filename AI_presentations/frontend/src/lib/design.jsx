import { useEffect, useState } from "react";

import { DeckSlideThumbCanvas, isGeneratedDeckSlide } from "@/lib/slidePreview";

export const Icon = ({ name, size = 16, stroke = 1.7, style, ...rest }) => {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: stroke,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style,
    ...rest,
  };

  switch (name) {
    case "logo":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style} {...rest}>
          <rect x="3" y="5" width="14" height="10" rx="2" fill="currentColor" opacity="0.25" />
          <rect x="7" y="9" width="14" height="10" rx="2" fill="currentColor" />
        </svg>
      );
    case "plus": return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "arrow-right": return <svg {...props}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case "arrow-left": return <svg {...props}><path d="M19 12H5M11 18l-6-6 6-6" /></svg>;
    case "chevron-down": return <svg {...props}><path d="M6 9l6 6 6-6" /></svg>;
    case "chevron-left": return <svg {...props}><path d="M15 18l-6-6 6-6" /></svg>;
    case "chevron-right": return <svg {...props}><path d="M9 18l6-6-6-6" /></svg>;
    case "x": return <svg {...props}><path d="M18 6L6 18M6 6l12 12" /></svg>;
    case "check": return <svg {...props}><path d="M20 6L9 17l-5-5" /></svg>;
    case "edit": return <svg {...props}><path d="M11 4H4v16h16v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>;
    case "share": return <svg {...props}><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>;
    case "download": return <svg {...props}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>;
    case "menu": return <svg {...props}><path d="M3 6h18M3 12h18M3 18h18" /></svg>;
    /** Правая боковая панель свёрнута — узкая полоска (как в Figma / ChatGPT). */
    case "panel-right-narrow":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <line x1="15" y1="7.5" x2="15" y2="16.5" />
        </svg>
      );
    /** Правая панель развернута — широкая область контента. */
    case "panel-right-wide":
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <line x1="10" y1="7.5" x2="10" y2="16.5" />
        </svg>
      );
    case "search": return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
    case "play": return <svg {...props}><path d="M6 4l14 8-14 8V4z" fill="currentColor" /></svg>;
    case "doc": return <svg {...props}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6M9 9h2" /></svg>;
    case "sparkles": return <svg {...props}><path d="M12 3l1.8 4.5L18 9l-4.2 1.5L12 15l-1.8-4.5L6 9l4.2-1.5L12 3zM18 14l.9 2.3L21 17l-2.1.7L18 20l-.9-2.3L15 17l2.1-.7L18 14zM5 16l.6 1.5L7 18l-1.4.5L5 20l-.6-1.5L3 18l1.4-.5L5 16z" /></svg>;
    case "lock":
      return (
        <svg {...props}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "settings": return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 0 1 7.04 4.3l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
    case "trash": return <svg {...props}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>;
    case "copy": return <svg {...props}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>;
    case "chart": return <svg {...props}><path d="M3 3v18h18" /><path d="M7 14l4-4 4 4 5-7" /></svg>;
    case "credit": return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>;
    case "history": return <svg {...props}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
    case "paperclip": return <svg {...props}><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>;
    case "mic": return <svg {...props}><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM19 11a7 7 0 0 1-14 0M12 18v4M8 22h8" /></svg>;
    case "user": return <svg {...props}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
    /** Круг с диагональю — «нет нумерации». */
    case "circle-slash":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M6 18L18 6" />
        </svg>
      );
    case "rotate-ccw":
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      );
    /** Палитра — раздел «Дизайн» в редакторе. */
    case "palette":
      return (
        <svg {...props}>
          <path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25c-.63 0-1.17.37-1.45.9l-.55 1.1z" />
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none" />
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none" />
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none" />
        </svg>
      );
    case "arrow-up-right":
      return (
        <svg {...props}>
          <path d="M7 17V7h10M7 17 17 7" />
        </svg>
      );
    case "message-square":
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
        </svg>
      );
    default: return null;
  }
};

/** id виртуальной темы «свои цвета» (только Pro, цвета в theme_custom). */
export const CUSTOM_THEME_ID = "custom";

const LEGACY_THEME_IDS = { corporate: "light", minimal: "light", vibrant: "bright_light" };

/** Совместимость со старыми значениями theme в БД. */
export function normalizeLegacyThemeId(themeId) {
  if (!themeId || typeof themeId !== "string") return "light";
  const t = themeId.trim();
  return LEGACY_THEME_IDS[t] || t || "light";
}

export function planRank(plan) {
  if (plan === "pro") return 2;
  if (plan === "student") return 1;
  return 0;
}

export function presetMinPlan(preset) {
  return preset?.minPlan || "free";
}

/** Доступен ли пресет (не custom) для тарифа. */
export function canUnlockPreset(userPlan, preset) {
  if (!preset || preset.id === CUSTOM_THEME_ID) return false;
  return planRank(userPlan) >= planRank(presetMinPlan(preset));
}

export function canUseCustomTheme(userPlan) {
  return userPlan === "pro";
}

/** Снять водяной знак в просмотрщике могут только пользователи Pro. */
export function canHideWatermark(userPlan) {
  return userPlan === "pro";
}

function hexToRgb(hex) {
  const h = String(hex).replace("#", "").slice(0, 6);
  if (h.length !== 6 || Number.isNaN(parseInt(h, 16))) return { r: 248, g: 250, b: 252 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Контрастный цвет текста к фону (упрощённо по яркости). */
export function contrastingInk(bgHex) {
  const { r, g, b } = hexToRgb(bgHex);
  const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return L > 0.55 ? "#0f172a" : "#f8fafc";
}

export function buildCustomPreset(themeCustom) {
  const bg = themeCustom?.bg || "#f8fafc";
  const accent = themeCustom?.accent || "#2563eb";
  const ink = themeCustom?.ink || contrastingInk(bg);
  return {
    id: CUSTOM_THEME_ID,
    name: "Своя тема",
    bg,
    ink,
    accent,
    palette: [bg, ink, accent, accent, ink],
    note: "только Pro",
    description: "Фон, текст и акцент задаёте вы; сохраняется в файле презентации.",
    minPlan: "pro",
  };
}

/** Пресет для миниатюр и просмотра с учётом custom из API. */
export function deckPreset(themeId, themeCustom) {
  const id = normalizeLegacyThemeId(themeId || "light");
  if (id === CUSTOM_THEME_ID) {
    return buildCustomPreset(themeCustom || {});
  }
  return STYLE_PRESETS.find((p) => p.id === id) || STYLE_PRESETS[0];
}

/** Палитра превью: ровно 5 пресетов + отдельно Pro «своя тема». */
export const STYLE_PRESETS = [
  {
    id: "light",
    minPlan: "free",
    name: "Светлая",
    bg: "#f7fbff",
    ink: "#0b1f3a",
    accent: "#2563eb",
    palette: ["#f7fbff", "#0b1f3a", "#2563eb", "#174ea6", "#dce8f5"],
    note: "базовый неяркий фон",
    description: "Спокойная светлая подложка и холодный акцент — подходит для отчётов, учебы и рабочих встреч.",
  },
  {
    id: "dark",
    minPlan: "free",
    name: "Тёмная",
    bg: "#0f2f5f",
    ink: "#f7fbff",
    accent: "#7dd3fc",
    palette: ["#0f2f5f", "#f7fbff", "#7dd3fc", "#38bdf8", "#1e4a7a"],
    note: "меньше бликов на экране",
    description: "Тёмный фон и светлый текст — комфортно в полутёмном зале и при записи экрана.",
  },
  {
    id: "bright_light",
    minPlan: "student",
    name: "Яркая светлая",
    bg: "#ffffff",
    ink: "#0f172a",
    accent: "#0284c7",
    palette: ["#ffffff", "#0f172a", "#0284c7", "#0369a1", "#e0f2fe"],
    note: "высокий контраст",
    description: "Чистый белый фон и насыщенный синий акцент — максимум читаемости на проекторе и в зале.",
  },
  {
    id: "bright_dark",
    minPlan: "student",
    name: "Яркая тёмная",
    bg: "#030712",
    ink: "#f8fafc",
    accent: "#22d3ee",
    palette: ["#030712", "#f8fafc", "#22d3ee", "#06b6d4", "#1e293b"],
    note: "неон на чёрном",
    description: "Глубокий чёрный фон и яркий циан — выразительный вид для демо и технических докладов.",
  },
  {
    id: "dawn",
    minPlan: "student",
    name: "Рассвет",
    bg: "#faf5ff",
    ink: "#4c1d95",
    accent: "#a855f7",
    palette: ["#faf5ff", "#4c1d95", "#a855f7", "#7c3aed", "#ede9fe"],
    note: "фиолетовый креатив",
    description: "Мягкая лавандовая подложка и фиолетовый акцент — для творческих питчей и запусков.",
  },
];

export function isDarkStyleId(id) {
  return id === "dark" || id === "bright_dark";
}

/** Имя темы для подписей в UI (как в STYLE_PRESETS или аккуратный fallback для неизвестного id). */
export function presentationThemeDisplayName(themeId) {
  if (!themeId || typeof themeId !== "string") return "";
  if (themeId === CUSTOM_THEME_ID) return "Своя тема";
  const nid = normalizeLegacyThemeId(themeId);
  const preset = STYLE_PRESETS.find((p) => p.id === nid);
  if (preset) return preset.name;
  const t = themeId.trim();
  if (!t) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Единый формат строки: «Стиль презентации …». */
export function presentationStyleCaption(themeId) {
  const name = presentationThemeDisplayName(themeId || "light");
  return name ? `Стиль презентации ${name}` : "";
}

export const PITCH_SLIDES = [
  { id: "cover", kind: "cover", eyebrow: "Пример презентации", title: "Helix", subtitle: "ИИ-ассистент для команд продаж в B2B SaaS", meta: ["Май 2026", "Черновик за 30 секунд"] },
  { id: "problem", kind: "two-column", eyebrow: "01 · Проблема", title: "Команды теряют часы на ручную подготовку материалов", bullets: ["Структура рождается дольше, чем сами идеи", "Слайды расходятся по стилю и тону", "Экспорт и публичная ссылка часто требуют отдельной доработки"], aside: "SlideUp превращает бриф в готовую презентацию: структура, текст, просмотр и экспорт в одном потоке." },
  { id: "solution", kind: "feature-grid", eyebrow: "02 · Решение", title: "Один запрос превращается в презентацию", features: [{ t: "Структура", d: "Модель собирает логику повествования и порядок слайдов." }, { t: "Текст", d: "Каждый слайд получает короткие тезисы без воды." }, { t: "Стиль", d: "Вы выбираете визуальное направление до генерации." }, { t: "Экспорт", d: "PPTX, PDF и публичная ссылка доступны из просмотра." }] },
  { id: "metrics", kind: "metrics", eyebrow: "03 · Метрики сервиса", title: "SlideUp уже используют для рабочих презентаций", metrics: [{ v: "1 200+", l: "презентаций", d: "сгенерировано за всё время" }, { v: "9 600+", l: "слайдов", d: "создано в сервисе" }, { v: "5", l: "стилей", d: "плюс своя тема на Pro" }, { v: "PDF/PPTX", l: "экспорт", d: "для встречи и отправки" }] },
  { id: "ask", kind: "ask", eyebrow: "04 · Следующий шаг", title: "Сгенерируйте презентацию и сразу покажите ее", blocks: [{ l: "Ввод", v: "идея" }, { l: "Выход", v: "слайды" }, { l: "Доставка", v: "PPTX/PDF" }], use: ["Отредактируйте один слайд через ИИ", "Сохраните историю в кабинете", "Поделитесь публичной ссылкой на Pro"] },
];

const Eyebrow = ({ text, accent }) => (
  <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.78em", color: accent, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{text}</div>
);

const titleStyle = {
  fontFamily: "var(--font-display)",
  fontSize: "2.35em",
  fontWeight: 650,
  letterSpacing: "-0.025em",
  lineHeight: 1.08,
  margin: 0,
};

const SlideContent = ({ slide, accent }) => {
  if (slide.kind === "cover") {
    return (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", height: "100%" }}>
        <div style={{ fontSize: "0.9em", color: accent, fontWeight: 600, fontFamily: "var(--font-mono)", letterSpacing: "0.04em", textTransform: "uppercase" }}>{slide.eyebrow}</div>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "5em", fontWeight: 700, lineHeight: 0.95, letterSpacing: "-0.04em", marginBottom: "0.3em" }}>{slide.title}</div>
          <div style={{ fontSize: "1.35em", color: "#36506f", maxWidth: "70%", lineHeight: 1.3 }}>{slide.subtitle}</div>
        </div>
        <div style={{ display: "flex", gap: "1em", color: "#7890ad", fontSize: "0.9em" }}>{slide.meta?.map((m) => <span key={m}>{m}</span>)}</div>
      </div>
    );
  }
  if (slide.kind === "two-column") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1.2em" }}>
        <Eyebrow text={slide.eyebrow} accent={accent} />
        <h2 style={titleStyle}>{slide.title}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "3em", flex: 1, alignItems: "start", marginTop: "1em" }}>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "1em" }}>
            {slide.bullets?.map((b, i) => (
              <li key={b} style={{ display: "flex", gap: "0.8em", alignItems: "baseline", fontSize: "1.12em", lineHeight: 1.4 }}>
                <span style={{ color: accent, fontFamily: "var(--font-mono)", fontSize: "0.7em" }}>0{i + 1}</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <aside style={{ background: "#eef6ff", padding: "1.2em", borderRadius: 8, fontSize: "0.95em", color: "#36506f", borderLeft: `3px solid ${accent}` }}>{slide.aside}</aside>
        </div>
      </div>
    );
  }
  if (slide.kind === "feature-grid") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1.2em" }}>
        <Eyebrow text={slide.eyebrow} accent={accent} />
        <h2 style={titleStyle}>{slide.title}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2em", flex: 1, marginTop: "1em" }}>
          {slide.features?.map((f, i) => (
            <div key={f.t} style={{ padding: "1.2em", background: "#f7fbff", borderRadius: 8, border: "1px solid #dce8f5" }}>
              <div style={{ fontFamily: "var(--font-mono)", color: accent, fontSize: "0.7em", marginBottom: "0.5em" }}>0{i + 1}</div>
              <div style={{ fontSize: "1.1em", fontWeight: 650, marginBottom: "0.4em" }}>{f.t}</div>
              <div style={{ color: "#36506f", fontSize: "0.92em", lineHeight: 1.4 }}>{f.d}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === "metrics") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1.2em" }}>
        <Eyebrow text={slide.eyebrow} accent={accent} />
        <h2 style={titleStyle}>{slide.title}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1em", flex: 1, alignItems: "center", marginTop: "1em" }}>
          {slide.metrics?.map((m) => (
            <div key={m.l} style={{ borderTop: `2px solid ${accent}`, paddingTop: "1.2em" }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "2.4em", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>{m.v}</div>
              <div style={{ fontSize: "0.9em", color: "#36506f", marginTop: "0.3em", fontWeight: 600 }}>{m.l}</div>
              <div style={{ fontSize: "0.78em", color: "#7890ad", marginTop: "0.2em", fontFamily: "var(--font-mono)" }}>{m.d}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (slide.kind === "ask") {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "1.2em" }}>
        <Eyebrow text={slide.eyebrow} accent={accent} />
        <h2 style={titleStyle}>{slide.title}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "3em", flex: 1, marginTop: "1em" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "1em" }}>
            {slide.blocks?.map((b) => (
              <div key={b.l} style={{ display: "flex", justifyContent: "space-between", padding: "1em 0", borderBottom: "1px solid #dce8f5" }}>
                <span style={{ color: "#7890ad", fontSize: "0.95em" }}>{b.l}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: "1.35em", fontWeight: 700 }}>{b.v}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: "0.85em", color: "#7890ad", fontFamily: "var(--font-mono)", marginBottom: "0.8em", textTransform: "uppercase", letterSpacing: "0.04em" }}>Что дальше</div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "0.6em" }}>
              {slide.use?.map((u) => (
                <li key={u} style={{ display: "flex", gap: "0.6em", alignItems: "baseline", fontSize: "0.98em" }}>
                  <span style={{ color: accent }}>→</span><span>{u}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export const Slide = ({ slide, accent = "var(--accent)" }) => (
  <div className="su-slide" style={{ background: "white", color: "#0b1f3a", fontFamily: "var(--font-sans)" }}>
    <div style={{ position: "absolute", inset: 0, padding: "7%", display: "flex", flexDirection: "column" }}>
      <SlideContent slide={slide} accent={accent} />
    </div>
    <div style={{ position: "absolute", bottom: "3.4%", left: "7%", right: "7%", display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "#9bb0c9", fontFamily: "var(--font-mono)", letterSpacing: "0.02em" }}>
      <span>SLIDEUP</span>
      <span>{slide.id?.toUpperCase()}</span>
    </div>
  </div>
);

export const SlideThumb = ({
  slide,
  accent = "var(--accent)",
  theme = "light",
  themeCustom = null,
  slideIndex = 0,
  slideTotal = 1,
}) => {
  const preset = deckPreset(theme, themeCustom);

  if (isGeneratedDeckSlide(slide)) {
    const total = Math.max(1, Number(slideTotal) || 1);
    const idx = Math.min(Math.max(0, Number(slideIndex) || 0), total - 1);
    return (
      <div style={{ width: "100%", aspectRatio: "16 / 9", borderRadius: 8, position: "relative", overflow: "hidden" }}>
        <DeckSlideThumbCanvas slide={slide} index={idx} total={total} preset={preset} />
      </div>
    );
  }

  const k = slide?.kind || "two-column";
  return (
    <div style={{ width: "100%", aspectRatio: "16 / 9", background: "white", border: "1px solid #dce8f5", borderRadius: 6, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: "8% 8% 16% 8%", display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ height: 4, width: "20%", background: accent, borderRadius: 2 }} />
        <div style={{ height: 6, width: "60%", background: "#0b1f3a", borderRadius: 2, marginTop: 4 }} />
        {k === "metrics" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginTop: "auto" }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{ borderTop: `2px solid ${accent}`, paddingTop: 4 }}>
                <div style={{ height: 8, background: "#0b1f3a", borderRadius: 1 }} />
                <div style={{ height: 3, background: "#c7d8ec", marginTop: 2, borderRadius: 1 }} />
              </div>
            ))}
          </div>
        )}
        {k === "feature-grid" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginTop: "auto" }}>
            {[0, 1, 2, 3].map((i) => <div key={i} style={{ background: "#f7fbff", border: "1px solid #dce8f5", borderRadius: 2, height: 18 }} />)}
          </div>
        )}
        {k === "two-column" && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ height: 3, width: "70%", background: "#c7d8ec", borderRadius: 1 }} />
            <div style={{ height: 3, width: "60%", background: "#c7d8ec", borderRadius: 1 }} />
            <div style={{ height: 3, width: "65%", background: "#c7d8ec", borderRadius: 1 }} />
          </div>
        )}
        {k === "cover" && <div style={{ marginTop: "auto" }}><div style={{ height: 3, width: "30%", background: "#c7d8ec", borderRadius: 1 }} /></div>}
        {k === "ask" && (
          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
            {[0, 1, 2].map((i) => <div key={i} style={{ height: 5, background: "#f7fbff", border: "1px solid #dce8f5" }} />)}
          </div>
        )}
      </div>
    </div>
  );
};

/** Расширения файлов превью стиля в `public/style-previews/{id}.{ext}` — по порядку до первого успешного. */
const STYLE_PREVIEW_FILE_EXTS = ["webp", "png", "jpg", "jpeg"];

function StylePreviewFallback({ preset }) {
  const cover = PITCH_SLIDES.find((s) => s.kind === "cover");
  const title = cover?.title ?? "Helix";
  const rawSub = cover?.subtitle ?? "";
  const subtitle =
    rawSub.length > 40 ? `${rawSub.slice(0, 38).trim()}…` : rawSub || "Краткий подзаголовок";

  const isDark = isDarkStyleId(preset.id);
  const border = isDark ? "1px solid rgba(255,255,255,0.14)" : `1px solid color-mix(in srgb, ${preset.ink} 11%, transparent)`;
  const subtleLine = isDark ? "rgba(255,255,255,0.14)" : `color-mix(in srgb, ${preset.ink} 18%, transparent)`;
  const cardBg = isDark ? "rgba(255,255,255,0.07)" : `color-mix(in srgb, ${preset.ink} 5%, ${preset.bg})`;
  const pillBg = isDark ? "rgba(125,211,252,0.14)" : `color-mix(in srgb, ${preset.accent} 16%, ${preset.bg})`;

  const minimal = preset.id === "bright_light";
  const corporate = preset.id === "light";
  const vibrant = preset.id === "bright_light" || preset.id === "bright_dark" || preset.id === "dawn";

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
        border,
        fontFamily: "var(--font-sans)",
        fontSize: 7,
        lineHeight: 1.22,
        userSelect: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          padding: "9% 10% 10%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 5,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: minimal ? 5 : 4 }}>
          {minimal ? (
            <div style={{ width: "24%", height: 2, borderRadius: 2, background: preset.accent }} />
          ) : (
            <div
              style={{
                alignSelf: "flex-start",
                padding: "2px 6px",
                borderRadius: 3,
                background: pillBg,
                color: preset.accent,
                fontFamily: "var(--font-mono)",
                fontSize: "0.82em",
                fontWeight: 700,
                letterSpacing: "0.07em",
                textTransform: "uppercase",
              }}
            >
              Титульный
            </div>
          )}
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: minimal ? "2.35em" : "2.5em",
              fontWeight: 780,
              letterSpacing: "-0.035em",
              lineHeight: 1.02,
              color: preset.ink,
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: "1.08em",
              opacity: isDark ? 0.78 : 0.74,
              maxWidth: "96%",
              lineHeight: 1.28,
            }}
          >
            {subtitle}
          </div>
        </div>

        {corporate ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ paddingTop: 4, borderTop: `2px solid ${preset.accent}` }}>
                <div style={{ height: 5, borderRadius: 2, background: preset.ink, opacity: 0.88, marginBottom: 3 }} />
                <div style={{ height: 2, borderRadius: 1, background: preset.ink, opacity: 0.28 }} />
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
            <div
              style={{
                flex: 1,
                borderRadius: 4,
                border: `1px solid ${subtleLine}`,
                background: cardBg,
                padding: "5px 6px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                minHeight: vibrant ? 24 : 22,
              }}
            >
              <div style={{ height: 2, width: "38%", borderRadius: 1, background: preset.accent, opacity: 0.92 }} />
              <div style={{ height: 2, width: "78%", borderRadius: 1, background: preset.ink, opacity: isDark ? 0.35 : 0.28 }} />
              <div style={{ height: 2, width: "55%", borderRadius: 1, background: preset.ink, opacity: isDark ? 0.22 : 0.18 }} />
            </div>
            <div
              style={{
                width: vibrant ? "30%" : "27%",
                borderRadius: 4,
                minHeight: vibrant ? 24 : 22,
                background: vibrant
                  ? `linear-gradient(155deg, ${preset.accent}, color-mix(in srgb, ${preset.accent} 72%, ${preset.ink}))`
                  : `linear-gradient(180deg, color-mix(in srgb, ${preset.accent} 92%, ${preset.bg}), color-mix(in srgb, ${preset.accent} 68%, ${preset.ink}))`,
                opacity: isDark ? 0.92 : 1,
                boxShadow: vibrant ? `inset 0 1px 0 rgba(255,255,255,0.22)` : undefined,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export const StylePreview = ({ preset }) => {
  const [extIdx, setExtIdx] = useState(0);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setExtIdx(0);
    setUseFallback(false);
  }, [preset.id]);

  if (useFallback) {
    return <StylePreviewFallback preset={preset} />;
  }

  const isDark = isDarkStyleId(preset.id);
  const border = isDark ? "1px solid rgba(255,255,255,0.14)" : `1px solid color-mix(in srgb, ${preset.ink} 11%, transparent)`;
  const ext = STYLE_PREVIEW_FILE_EXTS[extIdx] ?? STYLE_PREVIEW_FILE_EXTS[0];
  const src = `/style-previews/${preset.id}.${ext}`;

  return (
    <img
      key={src}
      src={src}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => {
        if (extIdx < STYLE_PREVIEW_FILE_EXTS.length - 1) {
          setExtIdx((i) => i + 1);
        } else {
          setUseFallback(true);
        }
      }}
      style={{
        aspectRatio: "16 / 9",
        width: "100%",
        height: "auto",
        borderRadius: 8,
        objectFit: "cover",
        display: "block",
        border,
        background: preset.bg,
        verticalAlign: "top",
      }}
    />
  );
};

export const accentForTheme = (themeId, themeCustom) => {
  const id = normalizeLegacyThemeId(themeId || "light");
  if (id === CUSTOM_THEME_ID) {
    return themeCustom?.accent || "#2563eb";
  }
  return STYLE_PRESETS.find((preset) => preset.id === id)?.accent || "#2563eb";
};
