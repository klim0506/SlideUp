/** @typedef {'user' | 'ai' | 'import' | 'template'} SlideVersionSource */

export const SLIDE_SID_KEY = "_sid";

export const VERSION_SOURCE_LABELS = {
  user: "Пользователь",
  ai: "ИИ",
  import: "Импорт",
  template: "Шаблон",
};

export function newSlideSid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `sid_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Глубокая копия слайда для снимка в истории. */
export function cloneSlideSnapshot(slide) {
  return typeof structuredClone === "function" ? structuredClone(slide) : JSON.parse(JSON.stringify(slide));
}

/** Гарантирует у слайда стабильный id (для ключа истории). */
export function ensureSlideWithSid(slide) {
  if (!slide || typeof slide !== "object") return slide;
  if (slide[SLIDE_SID_KEY]) return slide;
  return { ...slide, [SLIDE_SID_KEY]: newSlideSid() };
}

/** Нормализует карту истории с сервера. */
export function normalizeHistoriesMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (Array.isArray(v)) out[k] = v;
  }
  return out;
}

/**
 * Список версий в хронологическом порядке [v1, v2, …] для отображения сверху вниз как «сначала старые».
 * Для компактного UI возвращаем newest-first с полем versionNumber (1…N, где N — последняя).
 */
export function versionsForDisplay(chronological) {
  if (!Array.isArray(chronological)) return [];
  const n = chronological.length;
  return chronological
    .map((entry, i) => ({
      ...entry,
      versionNumber: i + 1,
      _chronoIndex: i,
    }))
    .reverse();
}

export function formatVersionTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

/** Первая запись истории для нового слайда. */
export function initialVersionEntry(slide, summary = "Первая версия слайда") {
  return {
    at: new Date().toISOString(),
    source: "template",
    summary,
    slide: cloneSlideSnapshot(slide),
  };
}
