import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import UpsellModal from "@/components/UpsellModal";
import {
  Icon,
  STYLE_PRESETS,
  CUSTOM_THEME_ID,
  buildCustomPreset,
  canUnlockPreset,
  canHideWatermark,
  canUseCustomTheme,
  normalizeLegacyThemeId,
  presentationStyleCaption,
} from "@/lib/design";
import { SlideHistoryTab } from "@/components/presentation/SlideHistoryTab";
import { SlideVersionsColumn } from "@/components/presentation/SlideVersionsColumn";
import { apiFetch, apiJson, clearTokens, getAccessToken, getMe, logout, navigate } from "@/lib/api";
import {
  SLIDE_SID_KEY,
  cloneSlideSnapshot,
  ensureSlideWithSid,
  initialVersionEntry,
  normalizeHistoriesMap,
  newSlideSid,
} from "@/lib/slideHistory";
import { DeckSlideThumbCanvas, getSlideBullets, getSlideStats, getSlideSubtitle, getSlideTitle } from "@/lib/slidePreview";

const VIEWER_STORAGE_PREFIX = "slideup-viewer-appearance:";

/** Режим отображения счётчика слайдов в просмотрщике. */
const PAGE_NUMBER_MODE_NONE = "none";
const PAGE_NUMBER_MODE_CORNER_BR = "corner_br";
const PAGE_NUMBER_MODE_CORNER_TR = "corner_tr";

const DEFAULT_PAGE_NUMBER_MODE = PAGE_NUMBER_MODE_CORNER_TR;

const PAGE_NUMBER_MODES_VALID = new Set([
  PAGE_NUMBER_MODE_NONE,
  PAGE_NUMBER_MODE_CORNER_BR,
  PAGE_NUMBER_MODE_CORNER_TR,
]);

function normalizePageNumberMode(value) {
  if (value === "dock") return DEFAULT_PAGE_NUMBER_MODE;
  if (typeof value === "string" && PAGE_NUMBER_MODES_VALID.has(value)) return value;
  return DEFAULT_PAGE_NUMBER_MODE;
}

/** Режим водяного знака SlideUp на слайде. */
const WATERMARK_MODE_NONE = "none";
const WATERMARK_MODE_CORNER_BR = "corner_br";
/** Верхний правый угол (знак рядом с верхней нумерацией). */
const WATERMARK_MODE_CORNER_TR = "corner_tr";

const DEFAULT_WATERMARK_MODE = WATERMARK_MODE_CORNER_TR;

const WATERMARK_MODES_VALID = new Set([WATERMARK_MODE_NONE, WATERMARK_MODE_CORNER_BR, WATERMARK_MODE_CORNER_TR]);

function normalizeWatermarkMode(value, legacyShowWatermark) {
  if (value === "corner_tl") return WATERMARK_MODE_CORNER_TR;
  if (typeof value === "string" && WATERMARK_MODES_VALID.has(value)) return value;
  if (typeof legacyShowWatermark === "boolean") {
    return legacyShowWatermark ? WATERMARK_MODE_CORNER_TR : WATERMARK_MODE_NONE;
  }
  return DEFAULT_WATERMARK_MODE;
}

function scaledClamp(minPx, vw, maxPx, scale) {
  return `clamp(${minPx * scale}px, ${vw * scale}vw, ${maxPx * scale}px)`;
}

export default function PresentationView({ id, publicView = false }) {
  const canvasRef = useRef(null);
  const pendingDownloadRef = useRef(null);
  const titleEditDismissRef = useRef(false);
  const [slideAreaEl, setSlideAreaEl] = useState(null);
  const [slideDims, setSlideDims] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window === "undefined" ? 1440 : window.innerWidth));

  const [presentation, setPresentation] = useState(null);
  const [theme, setTheme] = useState("light");
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [billingUsage, setBillingUsage] = useState(null);
  const [user, setUser] = useState(null);

  const [titleEditing, setTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  const [sessionExpired, setSessionExpired] = useState(false);
  const [presentationReloadNonce, setPresentationReloadNonce] = useState(0);

  const [editorSidebarPanel, setEditorSidebarPanel] = useState(null);
  const [displayThemeId, setDisplayThemeId] = useState("");
  const [customColorDraft, setCustomColorDraft] = useState(null);
  const [themeSaveBusy, setThemeSaveBusy] = useState(false);
  const [fontScale, setFontScale] = useState(1);
  const [pageNumberMode, setPageNumberMode] = useState(DEFAULT_PAGE_NUMBER_MODE);
  const [watermarkMode, setWatermarkMode] = useState(DEFAULT_WATERMARK_MODE);

  const [historySlideIndex, setHistorySlideIndex] = useState(0);
  const [historyPreviewChrono, setHistoryPreviewChrono] = useState(null);
  const [historyCompareChrono, setHistoryCompareChrono] = useState(null);
  const [localAiOpen, setLocalAiOpen] = useState(false);
  const [localAiMessages, setLocalAiMessages] = useState([]);
  const [localAiBusy, setLocalAiBusy] = useState(false);
  const [deckAiBusy, setDeckAiBusy] = useState(false);
  const [persistBusy, setPersistBusy] = useState(false);

  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];
  const userPlan = user?.plan || "free";

  const normalizedDeckTheme = useMemo(
    () => normalizeLegacyThemeId(presentation?.theme ?? theme ?? "light"),
    [presentation?.theme, theme],
  );

  const effectiveThemeId = useMemo(() => {
    const raw = displayThemeId !== "" ? displayThemeId : normalizedDeckTheme;
    return normalizeLegacyThemeId(raw);
  }, [displayThemeId, normalizedDeckTheme]);

  const basePreset = useMemo(() => {
    if (effectiveThemeId === CUSTOM_THEME_ID) {
      const merged = { ...(presentation?.theme_custom || {}), ...(customColorDraft || {}) };
      return buildCustomPreset(merged);
    }
    return STYLE_PRESETS.find((item) => item.id === effectiveThemeId) || STYLE_PRESETS[0];
  }, [effectiveThemeId, presentation?.theme_custom, customColorDraft]);

  const handleViewerThemeSelect = useCallback(
    (nextId) => {
      const nid = normalizeLegacyThemeId(nextId);
      if (nid === CUSTOM_THEME_ID) {
        if (!canUseCustomTheme(userPlan)) {
          setUpsellOpen(true);
          return;
        }
        setDisplayThemeId(CUSTOM_THEME_ID);
        return;
      }
      const preset = STYLE_PRESETS.find((p) => p.id === nid);
      if (preset && !canUnlockPreset(userPlan, preset)) {
        setUpsellOpen(true);
        return;
      }
      setCustomColorDraft(null);
      setDisplayThemeId(nid);
    },
    [userPlan],
  );

  const saveCustomThemeToDeck = useCallback(async () => {
    if (publicView || !presentation?.id) return;
    if (!getAccessToken()) {
      setAuthOpen(true);
      return;
    }
    if (!canUseCustomTheme(userPlan)) {
      setUpsellOpen(true);
      return;
    }
    const merged = { ...(presentation?.theme_custom || {}), ...(customColorDraft || {}) };
    const theme_custom = {
      ...(merged.bg ? { bg: merged.bg } : {}),
      ...(merged.ink ? { ink: merged.ink } : {}),
      ...(merged.accent ? { accent: merged.accent } : {}),
    };
    if (Object.keys(theme_custom).length === 0) {
      setNotice("Задайте хотя бы один цвет (#RRGGBB).");
      return;
    }
    setThemeSaveBusy(true);
    setNotice("");
    try {
      const data = await apiJson(`/api/presentations/${id}/theme/`, {
        method: "PATCH",
        body: JSON.stringify({ theme: CUSTOM_THEME_ID, theme_custom }),
      });
      setPresentation(data);
      setTheme(data.theme || CUSTOM_THEME_ID);
      setNotice("Тема сохранена в файле презентации.");
    } catch (err) {
      setNotice(err.message || "Не удалось сохранить тему.");
    } finally {
      setThemeSaveBusy(false);
    }
  }, [publicView, presentation?.id, userPlan, id]);

  const selectedSlide = slides[currentSlide] || null;
  const sidebarOverlay = viewportWidth < 1280;
  const sidebarPanelWidth = Math.max(280, Math.min(EDITOR_PANEL_WIDTH, viewportWidth - 120));

  const slideHistoriesMap = useMemo(() => normalizeHistoriesMap(presentation?.slide_histories), [presentation?.slide_histories]);

  const persistDeckPatch = useCallback(
    async (patch, successNotice) => {
      if (publicView || !presentation?.id) return;
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      setPersistBusy(true);
      setNotice("");
      try {
        const data = await apiJson(`/api/presentations/${id}/`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setPresentation(data);
        if (successNotice) setNotice(successNotice);
      } catch (err) {
        const msg = err.message || "Не удалось сохранить.";
        setNotice(msg);
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
      } finally {
        setPersistBusy(false);
      }
    },
    [publicView, presentation?.id, id],
  );

  /** Нужно ли один раз дописать _sid и начальную историю (без сравнения JSON.stringify — порядок ключей давал ложные изменения). */
  const needsDeckBackfill = useMemo(() => {
    if (!presentation?.slides?.length) return false;
    const raw = presentation.slides;
    const hist = normalizeHistoriesMap(presentation.slide_histories);
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      if (!s || typeof s !== "object") continue;
      if (!s[SLIDE_SID_KEY]) return true;
      if (!hist[s[SLIDE_SID_KEY]]?.length) return true;
    }
    return false;
  }, [presentation?.slides, presentation?.slide_histories]);

  useEffect(() => {
    if (!slides.length) return;
    setHistorySlideIndex((idx) => Math.min(Math.max(0, idx), slides.length - 1));
  }, [slides.length]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (!presentation?.id || publicView) return;
    if (!getAccessToken()) return;
    if (!needsDeckBackfill) return;
    const rawSlides = Array.isArray(presentation.slides) ? presentation.slides : [];
    const nextSlides = rawSlides.map((s) => (s && typeof s === "object" ? ensureSlideWithSid(s) : s));
    let hist = normalizeHistoriesMap(presentation.slide_histories);
    for (let i = 0; i < nextSlides.length; i++) {
      const s = nextSlides[i];
      if (!s || typeof s !== "object") continue;
      const sid = s[SLIDE_SID_KEY];
      if (!hist[sid]?.length) {
        hist = { ...hist, [sid]: [initialVersionEntry(s)] };
      }
    }
    void persistDeckPatch({ slides: nextSlides, slide_histories: hist }, "");
  }, [
    needsDeckBackfill,
    presentation?.id,
    presentation?.slides,
    presentation?.slide_histories,
    publicView,
    presentationReloadNonce,
    persistDeckPatch,
  ]);

  const historySlideSafe = Math.min(Math.max(0, historySlideIndex), Math.max(0, slides.length - 1));

  const historyVersions = useMemo(() => {
    const s = slides[historySlideSafe];
    if (!s?.[SLIDE_SID_KEY]) return [];
    return slideHistoriesMap[s[SLIDE_SID_KEY]] || [];
  }, [slides, historySlideSafe, slideHistoriesMap]);

  const currentSlideVersionsChrono = useMemo(() => {
    const s = slides[currentSlide];
    if (!s?.[SLIDE_SID_KEY]) return [];
    return slideHistoriesMap[s[SLIDE_SID_KEY]] || [];
  }, [slides, currentSlide, slideHistoriesMap]);

  const slideForCanvas = useMemo(() => {
    if (historyPreviewChrono == null || !selectedSlide?.[SLIDE_SID_KEY]) return selectedSlide;
    const chain = slideHistoriesMap[selectedSlide[SLIDE_SID_KEY]];
    const snap = chain?.[historyPreviewChrono]?.slide;
    return snap || selectedSlide;
  }, [historyPreviewChrono, selectedSlide, slideHistoriesMap]);

  const applyRefinedSlideAtIndex = useCallback(
    async (slideIndex, refinedSlide, summary, source = "ai") => {
      if (!presentation) return;
      const sid = slides[slideIndex]?.[SLIDE_SID_KEY] || refinedSlide?.[SLIDE_SID_KEY] || newSlideSid();
      const merged = { ...refinedSlide, [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides];
      nextSlides[slideIndex] = merged;
      const hist = { ...slideHistoriesMap };
      const chain = [...(hist[sid] || [])];
      chain.push({
        at: new Date().toISOString(),
        source,
        summary,
        slide: cloneSlideSnapshot(merged),
      });
      hist[sid] = chain;
      await persistDeckPatch({ slides: nextSlides, slide_histories: hist }, "Слайд обновлён — добавлена версия в историю.");
    },
    [presentation, slides, slideHistoriesMap, persistDeckPatch],
  );

  const handleApplyDeckAssist = useCallback(
    async (instruction) => {
      if (!presentation || publicView) return;
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      setDeckAiBusy(true);
      setNotice("");
      try {
        const data = await apiJson("/api/assist-deck/", {
          method: "POST",
          body: JSON.stringify({
            presentation_title: presentation.title || "Презентация",
            slides,
            instruction,
            presentation_id: presentation.id,
          }),
        });
        const nextSlides = [...(data.slides || [])];
        if (nextSlides.length !== slides.length) {
          throw new Error("Модель вернула другое число слайдов — правка отменена.");
        }
        const hist = { ...slideHistoriesMap };
        const now = new Date().toISOString();
        const short = instruction.length > 100 ? `${instruction.slice(0, 100)}…` : instruction;
        const summary = `ИИ по всей презентации: ${short}`;
        for (let i = 0; i < nextSlides.length; i++) {
          const prev = slides[i];
          const sid = prev?.[SLIDE_SID_KEY] || nextSlides[i]?.[SLIDE_SID_KEY] || newSlideSid();
          const merged = { ...nextSlides[i], [SLIDE_SID_KEY]: sid };
          nextSlides[i] = merged;
          const chain = [...(hist[sid] || [])];
          chain.push({ at: now, source: "ai", summary, slide: cloneSlideSnapshot(merged) });
          hist[sid] = chain;
        }
        const patch = { slides: nextSlides, slide_histories: hist };
        if (data.title && data.title !== presentation.title) patch.title = data.title;
        await persistDeckPatch(patch, "Презентация обновлена — у каждого слайда новая версия в истории.");
      } catch (err) {
        setNotice(err.message || "Не удалось применить ИИ к презентации.");
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
        throw err;
      } finally {
        setDeckAiBusy(false);
      }
    },
    [presentation, publicView, slides, slideHistoriesMap, persistDeckPatch],
  );

  const handleSendLocalSlideAi = useCallback(
    async (text, focusChrono) => {
      if (!presentation || publicView) return;
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      const slideIndex = historySlideSafe;
      const sid = slides[slideIndex]?.[SLIDE_SID_KEY];
      const versions = sid ? slideHistoriesMap[sid] || [] : [];
      const baseSlide = versions[focusChrono]?.slide || slides[slideIndex];
      if (!baseSlide) return;
      const vLabel = `v${focusChrono + 1}`;
      const instruction = `Работай только с одним слайдом (JSON ниже — полный слайд). Опорная версия: ${vLabel}.\nЗапрос: ${text}`;
      setLocalAiBusy(true);
      try {
        const { slide } = await apiJson("/api/refine-slide/", {
          method: "POST",
          body: JSON.stringify({
            slide: baseSlide,
            instruction,
            presentation_title: presentation.title || "Презентация",
            presentation_id: presentation.id,
          }),
        });
        const short = text.length > 88 ? `${text.slice(0, 88)}…` : text;
        await applyRefinedSlideAtIndex(slideIndex, slide, `ИИ: ${short}`, "ai");
        setLocalAiMessages((m) => [...m, { role: "assistant", text: "Готово — изменения сохранены как новая версия этого слайда." }]);
      } catch (err) {
        setLocalAiMessages((m) => [...m, { role: "assistant", text: err.message || "Запрос не выполнен." }]);
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
      } finally {
        setLocalAiBusy(false);
      }
    },
    [presentation, publicView, slides, slideHistoriesMap, historySlideSafe, applyRefinedSlideAtIndex],
  );

  const handleRepromptCurrentSlide = useCallback(
    async (text, focusChrono) => {
      if (!presentation || publicView) return;
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      const slideIndex = currentSlide;
      const sid = slides[slideIndex]?.[SLIDE_SID_KEY];
      const versions = sid ? slideHistoriesMap[sid] || [] : [];
      const baseSlide = versions[focusChrono]?.slide || slides[slideIndex];
      if (!baseSlide) return;
      const vLabel = focusChrono >= 0 ? `v${focusChrono + 1}` : "текущей";
      const instruction = `Работай только с одним слайдом (JSON ниже — полный слайд). Опорная версия: ${vLabel}.\nЗапрос: ${text}`;
      setLocalAiBusy(true);
      try {
        const { slide } = await apiJson("/api/refine-slide/", {
          method: "POST",
          body: JSON.stringify({
            slide: baseSlide,
            instruction,
            presentation_title: presentation.title || "Презентация",
            presentation_id: presentation.id,
          }),
        });
        const short = text.length > 88 ? `${text.slice(0, 88)}…` : text;
        await applyRefinedSlideAtIndex(slideIndex, slide, `ИИ: ${short}`, "ai");
        setNotice("Слайд обновлён.");
      } catch (err) {
        setNotice(err.message || "Запрос не выполнен.");
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
      } finally {
        setLocalAiBusy(false);
      }
    },
    [presentation, publicView, slides, slideHistoriesMap, currentSlide, applyRefinedSlideAtIndex],
  );

  const handleHistoryRestore = useCallback(
    (chronoIdx) => {
      const i = historySlideSafe;
      const sid = slides[i]?.[SLIDE_SID_KEY];
      const chain = sid ? slideHistoriesMap[sid] : null;
      const snap = chain?.[chronoIdx]?.slide;
      if (!snap || !sid) return;
      const merged = { ...snap, [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides];
      nextSlides[i] = merged;
      const nextChain = [...(chain || [])];
      nextChain.push({
        at: new Date().toISOString(),
        source: "user",
        summary: `Восстановлена версия v${chronoIdx + 1}`,
        slide: cloneSlideSnapshot(merged),
      });
      const nextHist = { ...slideHistoriesMap, [sid]: nextChain };
      void persistDeckPatch({ slides: nextSlides, slide_histories: nextHist }, "Версия восстановлена.");
      setHistoryPreviewChrono(null);
      setHistoryCompareChrono(null);
    },
    [slides, slideHistoriesMap, historySlideSafe, persistDeckPatch],
  );

  const inlineEditTimeoutRef = useRef(null);

  const handleRestoreCurrentSlide = useCallback(
    (chronoIdx) => {
      clearTimeout(inlineEditTimeoutRef.current);
      if (persistBusy) return;
      const i = currentSlide;
      const sid = slides[i]?.[SLIDE_SID_KEY];
      const chain = sid ? slideHistoriesMap[sid] : null;
      const snap = chain?.[chronoIdx]?.slide;
      if (!snap || !sid) return;
      const merged = { ...snap, [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides];
      nextSlides[i] = merged;
      const nextChain = [...(chain || [])];
      nextChain.push({
        at: new Date().toISOString(),
        source: "user",
        summary: `Восстановлена версия v${chronoIdx + 1}`,
        slide: cloneSlideSnapshot(merged),
      });
      const nextHist = { ...slideHistoriesMap, [sid]: nextChain };
      void persistDeckPatch({ slides: nextSlides, slide_histories: nextHist }, "Версия восстановлена.");
    },
    [slides, slideHistoriesMap, currentSlide, persistBusy, persistDeckPatch],
  );

  const handleInlineSlideEdit = useCallback(
    (updatedSlide) => {
      if (publicView) return;
      const sid = updatedSlide[SLIDE_SID_KEY] || slides[currentSlide]?.[SLIDE_SID_KEY];
      const merged = { ...updatedSlide, [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides];
      nextSlides[currentSlide] = merged;
      setPresentation((prev) => prev ? { ...prev, slides: nextSlides } : prev);
      clearTimeout(inlineEditTimeoutRef.current);
      inlineEditTimeoutRef.current = setTimeout(() => {
        void persistDeckPatch({ slides: nextSlides }, "");
      }, 800);
    },
    [publicView, slides, currentSlide, persistDeckPatch],
  );

  const handleHistoryDuplicate = useCallback(
    (chronoIdx) => {
      const i = historySlideSafe;
      const sid = slides[i]?.[SLIDE_SID_KEY];
      const chain = sid ? slideHistoriesMap[sid] : null;
      const snap = chain?.[chronoIdx]?.slide;
      if (!snap) return;
      const ns = newSlideSid();
      const newSlide = { ...cloneSlideSnapshot(snap), [SLIDE_SID_KEY]: ns };
      const nextSlides = [...slides, newSlide];
      const nextHist = { ...slideHistoriesMap };
      nextHist[ns] = [
        {
          at: new Date().toISOString(),
          source: "user",
          summary: `Копия слайда ${i + 1} (v${chronoIdx + 1})`,
          slide: cloneSlideSnapshot(newSlide),
        },
      ];
      void persistDeckPatch({ slides: nextSlides, slide_histories: nextHist }, "Слайд добавлен в конец.");
      setCurrentSlide(nextSlides.length - 1);
      setEditorSidebarPanel(null);
    },
    [slides, slideHistoriesMap, historySlideSafe, persistDeckPatch],
  );

  useEffect(() => {
    setHistoryPreviewChrono(null);
    setHistoryCompareChrono(null);
  }, [historySlideIndex]);

  useEffect(() => {
    setLocalAiMessages([]);
  }, [historySlideIndex]);

  const moveSlide = useCallback((delta) => {
    setCurrentSlide((value) => {
      const next = value + delta;
      if (next < 0) return slides.length - 1;
      if (next >= slides.length) return 0;
      return next;
    });
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return undefined;
    function onKeyDown(event) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      if (event.key === "ArrowLeft") moveSlide(-1);
      else moveSlide(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slides.length, moveSlide]);

  const pdfExportLocked = useMemo(() => {
    if (!billingUsage || billingUsage.pdf_exports_limit == null) return false;
    const lim = Number(billingUsage.pdf_exports_limit);
    if (!Number.isFinite(lim) || lim <= 0) return false;
    return Number(billingUsage.pdf_exports_used) >= lim;
  }, [billingUsage]);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    setTitleEditing(false);
    setTitleDraft("");
    setSessionExpired(false);
  }, [id]);

  const refreshExportUsage = useCallback(async () => {
    if (!getAccessToken()) {
      setBillingUsage(null);
      return;
    }
    try {
      const u = await apiJson("/api/billing/usage/");
      setBillingUsage({
        pdf_exports_used: u.pdf_exports_used,
        pdf_exports_limit: u.pdf_exports_limit,
      });
    } catch {
      setBillingUsage(null);
    }
  }, []);

  useEffect(() => {
    async function loadPresentation() {
      setLoading(true);
      setError("");
      try {
        const data = await apiJson(`/api/presentations/${id}/`);
        setSessionExpired(false);
        setPresentation(data);
        setTheme(data.theme || "light");
        setCurrentSlide(0);

        let nextFontScale = 1;
        let nextDisplayThemeId = "";
        let nextCustomDraft = null;
        let nextPageNumberMode = DEFAULT_PAGE_NUMBER_MODE;
        let nextWatermarkMode = DEFAULT_WATERMARK_MODE;
        try {
          const raw = sessionStorage.getItem(`${VIEWER_STORAGE_PREFIX}${id}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.themeId === "string") nextDisplayThemeId = parsed.themeId;
            if (typeof parsed.fontScale === "number" && parsed.fontScale >= 0.5 && parsed.fontScale <= 1.5) {
              nextFontScale = parsed.fontScale;
            }
            if (typeof parsed.pageNumberMode === "string") {
              nextPageNumberMode = normalizePageNumberMode(parsed.pageNumberMode);
            } else if (typeof parsed.showPageNumbers === "boolean") {
              nextPageNumberMode = parsed.showPageNumbers ? PAGE_NUMBER_MODE_CORNER_TR : PAGE_NUMBER_MODE_NONE;
            }
            if (typeof parsed.watermarkMode === "string") {
              nextWatermarkMode = normalizeWatermarkMode(parsed.watermarkMode);
            } else if (typeof parsed.showWatermark === "boolean") {
              nextWatermarkMode = normalizeWatermarkMode(undefined, parsed.showWatermark);
            }
            if (parsed.themeId === CUSTOM_THEME_ID && parsed.customColors && typeof parsed.customColors === "object") {
              nextCustomDraft = parsed.customColors;
            }
          }
        } catch {
          /* ignore */
        }
        setDisplayThemeId(nextDisplayThemeId);
        setCustomColorDraft(nextCustomDraft);
        setFontScale(nextFontScale);
        setPageNumberMode(nextPageNumberMode);
        setWatermarkMode(nextWatermarkMode);
        void refreshExportUsage();
      } catch (rawErr) {
        const err = rawErr instanceof Error ? rawErr : new Error(String(rawErr ?? "unknown"));
        const status = typeof rawErr === "object" && rawErr !== null && "status" in rawErr ? rawErr.status : undefined;
        const msg = String(err.message || "").toLowerCase();
        const authLike =
          status === 401 ||
          msg.includes("token") ||
          msg.includes("not authenticated") ||
          msg.includes("credentials") ||
          msg.includes("не действителен");
        if (authLike && !publicView) {
          clearTokens();
          setUser(null);
          setSessionExpired(true);
          setError("");
          setAuthOpen(true);
        } else {
          setSessionExpired(false);
          if (status === 404 && !publicView) {
            setError(
              "Презентация не найдена или нет доступа. Если вы уже входили в аккаунт, откройте страницу на том же адресе, что при входе: localhost и 127.0.0.1 для браузера — разные сайты, сессия не переносится.",
            );
          } else {
            setError(err.message || "Не удалось загрузить презентацию");
          }
        }
      } finally {
        setLoading(false);
      }
    }
    loadPresentation();
  }, [id, publicView, refreshExportUsage, presentationReloadNonce]);

  useEffect(() => {
    if (!presentation?.id) return;
    try {
      sessionStorage.setItem(
        `${VIEWER_STORAGE_PREFIX}${id}`,
        JSON.stringify({
          themeId: displayThemeId,
          fontScale,
          pageNumberMode,
          watermarkMode,
          customColors: displayThemeId === CUSTOM_THEME_ID ? customColorDraft : null,
        }),
      );
    } catch {
      /* ignore */
    }
  }, [id, presentation?.id, displayThemeId, fontScale, pageNumberMode, watermarkMode, customColorDraft]);

  useEffect(() => {
    if (!slideAreaEl) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const hByWidth = width * 9 / 16;
      if (hByWidth <= height) {
        setSlideDims({ w: Math.floor(width), h: Math.floor(hByWidth) });
      } else {
        setSlideDims({ w: Math.floor(height * 16 / 9), h: Math.floor(height) });
      }
    });
    ro.observe(slideAreaEl);
    return () => ro.disconnect();
  }, [slideAreaEl]);

  function resetAppearanceToTheme() {
    setDisplayThemeId("");
    setCustomColorDraft(null);
    setFontScale(1);
    setPageNumberMode(DEFAULT_PAGE_NUMBER_MODE);
    setWatermarkMode(DEFAULT_WATERMARK_MODE);
    try {
      sessionStorage.removeItem(`${VIEWER_STORAGE_PREFIX}${id}`);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!presentation?.id) return;
    const plan = user?.plan || "free";
    if (displayThemeId === CUSTOM_THEME_ID && !canUseCustomTheme(plan)) {
      setDisplayThemeId("");
      setCustomColorDraft(null);
      return;
    }
    if (displayThemeId && displayThemeId !== CUSTOM_THEME_ID) {
      const preset = STYLE_PRESETS.find((p) => p.id === displayThemeId);
      if (preset && !canUnlockPreset(plan, preset)) {
        setDisplayThemeId("");
      }
    }
  }, [presentation?.id, user?.plan, displayThemeId]);

  useEffect(() => {
    if (!presentation?.id) return;
    if (publicView) {
      if (watermarkMode === WATERMARK_MODE_NONE) setWatermarkMode(DEFAULT_WATERMARK_MODE);
      return;
    }
    const token = getAccessToken();
    const planResolved = user !== null || !token;
    if (!planResolved) return;
    const plan = user?.plan || "free";
    if (!canHideWatermark(plan) && watermarkMode === WATERMARK_MODE_NONE) setWatermarkMode(DEFAULT_WATERMARK_MODE);
  }, [presentation?.id, publicView, user, watermarkMode]);

  async function download(format) {
    setNotice("");
    if (!getAccessToken()) {
      pendingDownloadRef.current = format;
      setAuthOpen(true);
      return;
    }

    try {
      const response = await apiFetch(`/api/export/${id}/${format}/`);
      if (response.status === 401) {
        pendingDownloadRef.current = format;
        setAuthOpen(true);
        return;
      }
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (data.show_upsell) setUpsellOpen(true);
        setNotice(data.detail || "Экспорт недоступен на текущем плане");
        return;
      }
      if (!response.ok) {
        setNotice("Не удалось подготовить файл");
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${presentation?.title || "presentation"}.${format}`;
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      if (format === "pdf") void refreshExportUsage();
    } catch {
      setNotice("Не удалось скачать файл. Попробуйте еще раз.");
    }
  }

  async function sharePresentation() {
    setNotice("");
    if (!getAccessToken()) {
      setAuthOpen(true);
      return;
    }

    try {
      const data = await apiJson(`/api/presentations/${id}/share/`, { method: "POST" });
      setShareUrl(data.public_url);
      await navigator.clipboard?.writeText(data.public_url);
      setNotice("Публичная ссылка скопирована");
    } catch (err) {
      if (err.data?.show_upsell) setUpsellOpen(true);
      setNotice(err.message || "Не удалось включить публичный доступ");
    }
  }

  function handleAuthSuccess() {
    const pending = pendingDownloadRef.current;
    pendingDownloadRef.current = null;
    const shouldReloadDeck = sessionExpired || !presentation;
    setSessionExpired(false);
    if (shouldReloadDeck) setPresentationReloadNonce((n) => n + 1);
    getMe().then(setUser).catch(() => setUser(null));
    if (pending) download(pending);
  }

  function toggleFullscreen() {
    if (!canvasRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
      return;
    }
    canvasRef.current.requestFullscreen?.();
  }

  function beginTitleEdit() {
    if (publicView || !presentation) return;
    if (!getAccessToken()) {
      setAuthOpen(true);
      return;
    }
    titleEditDismissRef.current = false;
    setTitleDraft(presentation.title || "");
    setTitleEditing(true);
  }

  function cancelTitleEdit() {
    if (!presentation) return;
    setTitleDraft(presentation.title || "");
    setTitleEditing(false);
  }

  async function commitTitleDraft() {
    if (!presentation) return;
    const trimmed = titleDraft.trim();
    const resolved = trimmed || "Без названия";
    const current = (presentation.title || "").trim() || "Без названия";
    if (resolved === current) {
      setTitleEditing(false);
      return;
    }
    if (!getAccessToken()) {
      setAuthOpen(true);
      return;
    }
    try {
      const data = await apiJson(`/api/presentations/${id}/`, {
        method: "PATCH",
        body: JSON.stringify({ title: resolved }),
      });
      setPresentation(data);
      setTitleEditing(false);
    } catch (err) {
      setNotice(err.message || "Не удалось сохранить название");
    }
  }

  function handleTitleBlur() {
    if (titleEditDismissRef.current) {
      titleEditDismissRef.current = false;
      return;
    }
    void commitTitleDraft();
  }

  if (loading) {
    return (
      <div className="su-page editor-dark" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px max(24px, 5vw)", display: "grid", placeItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, color: "var(--ink-3)", fontSize: 14 }}>
            <Icon name="logo" size={28} style={{ color: "var(--accent)" }} />
            Загружаем презентацию
          </div>
        </main>
      </div>
    );
  }

  if (error || !presentation) {
    const loadProblemMessage = sessionExpired
      ? "Сессия истекла или сохранённые данные входа больше не действуют. Войдите снова, чтобы открыть презентацию."
      : error || "Презентация не найдена";
    return (
      <div className="su-page editor-dark" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px max(24px, 5vw)", textAlign: "center" }}>
          <p style={{ color: sessionExpired ? "var(--ink-2)" : "#f87171", marginBottom: 18 }}>{loadProblemMessage}</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {sessionExpired ? (
              <button type="button" className="su-btn su-btn-accent" onClick={() => setAuthOpen(true)}>
                Войти
              </button>
            ) : null}
            {!sessionExpired ? (
              <button
                type="button"
                className="su-btn su-btn-outline"
                onClick={() => {
                  setError("");
                  setPresentationReloadNonce((n) => n + 1);
                }}
              >
                Повторить
              </button>
            ) : null}
            <button type="button" onClick={() => navigate("/")} className="su-btn su-btn-outline">
              На главную
            </button>
          </div>
        </main>
        <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />
      </div>
    );
  }

  return (
    <div
      className="su-page editor-dark"
      style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}
    >
      <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />

      <main
        className="viewer-layout"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          width: "100%",
          overflow: "hidden",
          padding: "20px 24px 20px",
          paddingRight: 24 + EDITOR_DOCK_WIDTH + (editorSidebarPanel && !sidebarOverlay ? sidebarPanelWidth : 0),
          transition: "padding-right 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <section style={{ minWidth: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* ── Title row ── */}
          <div style={{ marginBottom: 12, flexShrink: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 6 }}>
              {titleEditing ? (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    borderLeft: "3px solid var(--accent)",
                    paddingLeft: 12,
                    paddingTop: 2,
                    paddingBottom: 4,
                    borderRadius: "0 8px 8px 0",
                    background: "color-mix(in srgb, var(--accent) 7%, transparent)",
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); void commitTitleDraft(); }
                      if (e.key === "Escape") { e.preventDefault(); titleEditDismissRef.current = true; cancelTitleEdit(); }
                    }}
                    onBlur={handleTitleBlur}
                    aria-label="Название презентации"
                    style={{
                      display: "block",
                      width: "100%",
                      margin: 0,
                      padding: 0,
                      border: "none",
                      outline: "none",
                      boxShadow: "none",
                      background: "transparent",
                      WebkitAppearance: "none",
                      appearance: "none",
                      fontFamily: "var(--font-display)",
                      fontSize: "clamp(22px, 2.65vw, 30px)",
                      fontWeight: 750,
                      letterSpacing: "-0.035em",
                      lineHeight: 1.1,
                      color: "var(--ink)",
                      borderRadius: 0,
                      caretColor: "var(--accent)",
                      textDecorationLine: "underline",
                      textDecorationStyle: "dashed",
                      textDecorationThickness: "from-font",
                      textUnderlineOffset: "0.2em",
                      textDecorationColor: "color-mix(in srgb, var(--accent) 55%, transparent)",
                    }}
                  />
                </div>
              ) : (
                <>
                  <h1
                    role={publicView ? undefined : "button"}
                    tabIndex={publicView ? undefined : 0}
                    aria-label={publicView ? undefined : "Редактировать название"}
                    onClick={publicView ? undefined : beginTitleEdit}
                    onKeyDown={
                      publicView
                        ? undefined
                        : (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); beginTitleEdit(); } }
                    }
                    style={{
                      margin: 0,
                      padding: 0,
                      fontFamily: "var(--font-display)",
                      fontSize: "clamp(22px, 2.65vw, 30px)",
                      lineHeight: 1.1,
                      letterSpacing: "-0.035em",
                      fontWeight: 750,
                      wordBreak: "break-word",
                      cursor: publicView ? undefined : "pointer",
                      outline: "none",
                      flexShrink: 1,
                      minWidth: 0,
                    }}
                  >
                    {presentation.title || "Без названия"}
                  </h1>
                  {!publicView ? (
                    <button
                      type="button"
                      onClick={beginTitleEdit}
                      title="Редактировать название"
                      aria-label="Редактировать название"
                      style={{
                        flexShrink: 0,
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: "none",
                        background: "transparent",
                        display: "grid",
                        placeItems: "center",
                        color: "var(--ink-3)",
                        cursor: "pointer",
                        opacity: 0.38,
                        transition: "opacity 0.15s",
                      }}
                    >
                      <Icon name="edit" size={13} stroke={1.75} />
                    </button>
                  ) : null}
                </>
              )}
            </div>
            <div style={{ marginTop: 5, display: "flex", gap: 10, alignItems: "center", color: "var(--ink-3)", fontSize: 12 }}>
              <span>
                {slides.length} {slides.length === 1 ? "слайд" : slides.length >= 2 && slides.length <= 4 ? "слайда" : "слайдов"}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{presentationStyleCaption(presentation.theme || theme)}</span>
            </div>
          </div>

          {notice ? (
            <div
              style={{
                marginBottom: 14,
                flexShrink: 0,
                padding: "10px 14px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "var(--surface)",
                color: "var(--ink-2)",
                fontSize: 13,
                lineHeight: 1.45,
              }}
            >
              {notice}{shareUrl ? `: ${shareUrl}` : ""}
            </div>
          ) : null}

          {/* ── Slide canvas card ── */}
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              background: "var(--surface-2)",
              border: "1px solid var(--line)",
              borderRadius: 14,
              padding: 10,
              boxShadow: "0 4px 24px rgba(37,99,235,.09), 0 1px 4px rgba(15,31,58,.06)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0, width: "100%" }}>
              {/* main slide */}
              <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", alignItems: "stretch", gap: 8 }}>
                <SlideVersionsColumn
                  versionsChrono={currentSlideVersionsChrono}
                  slideIndex={currentSlide}
                  slidesLen={slides.length}
                  preset={basePreset}
                  onActivate={handleRestoreCurrentSlide}
                  onSendAi={handleRepromptCurrentSlide}
                  localAiBusy={localAiBusy}
                  busy={persistBusy}
                  publicView={publicView}
                />
                <div
                  ref={setSlideAreaEl}
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {slideDims && (
                    <SlideCanvas
                      slide={slideForCanvas}
                      index={currentSlide}
                      total={slides.length}
                      preset={basePreset}
                      fontScale={fontScale}
                      pageNumberMode={pageNumberMode}
                      watermarkMode={watermarkMode}
                      slideWidth={slideDims.w}
                      slideHeight={slideDims.h}
                      onSlideChange={!publicView ? handleInlineSlideEdit : null}
                    />
                  )}
                </div>
              </div>

              {/* thumbnails + nav */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minWidth: 0, flexShrink: 0 }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexWrap: "nowrap",
                    alignItems: "stretch",
                    gap: 7,
                    overflowX: "auto",
                    overflowY: "hidden",
                    overscrollBehaviorY: "none",
                    padding: "3px 2px 4px",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {slides.map((slide, index) => {
                    const active = currentSlide === index;
                    return (
                      <div
                        key={`${getSlideTitle(slide, index)}-${index}`}
                        style={{
                          flex: "0 0 auto",
                          width: 80,
                          position: "relative",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => setCurrentSlide(index)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            border: "1px solid var(--line)",
                            background: active ? "var(--surface)" : "rgba(255,255,255,.55)",
                            borderRadius: 6,
                            padding: 3,
                            color: "var(--ink)",
                            boxShadow: active ? `0 0 0 2px ${basePreset.accent}` : "none",
                            transition: "box-shadow 0.15s",
                            outline: "none",
                          }}
                        >
                          <SlideThumbnail slide={slide} index={index} total={slides.length} preset={basePreset} />
                          <div style={{ marginTop: 3, display: "flex", gap: 3, alignItems: "baseline", fontSize: 9, minWidth: 0, paddingLeft: 1 }}>
                            <span style={{ color: active ? basePreset.accent : "var(--ink-4)", fontFamily: "var(--font-mono)", flexShrink: 0, fontWeight: 700 }}>
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-3)" }}>
                              {getSlideTitle(slide, index)}
                            </span>
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <CanvasButton label="Назад" icon="arrow-left" onClick={() => moveSlide(-1)} />
                  <CanvasButton label="Вперед" icon="arrow-right" onClick={() => moveSlide(1)} />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <EditorRightSidebar
        activePanel={editorSidebarPanel}
        onActivePanelChange={setEditorSidebarPanel}
        activePresetId={effectiveThemeId}
        onPresetSelect={handleViewerThemeSelect}
        userPlan={userPlan}
        customPresetActive={effectiveThemeId === CUSTOM_THEME_ID}
        customPresetPreview={basePreset}
        canPersistCustom={!publicView && canUseCustomTheme(userPlan)}
        onCustomColorChange={(key, hex) => {
          setCustomColorDraft((prev) => ({
            ...(presentation?.theme_custom || {}),
            ...(prev || {}),
            [key]: hex,
          }));
        }}
        onSaveCustomTheme={() => void saveCustomThemeToDeck()}
        onApplySavedScheme={(scheme) => {
          setCustomColorDraft({ bg: scheme.bg, ink: scheme.ink, accent: scheme.accent });
        }}
        presentationId={id}
        themeSaveBusy={themeSaveBusy}
        publicView={publicView}
        pdfLocked={pdfExportLocked}
        onDownload={(format) => download(format)}
        onPdfLocked={() => setUpsellOpen(true)}
        onShare={sharePresentation}
        onDemo={toggleFullscreen}
        hasOverrides={Boolean(
          (displayThemeId !== "" && normalizeLegacyThemeId(displayThemeId) !== normalizedDeckTheme) ||
            (Boolean(customColorDraft) && effectiveThemeId === CUSTOM_THEME_ID) ||
            fontScale !== 1 ||
            pageNumberMode !== DEFAULT_PAGE_NUMBER_MODE ||
            watermarkMode !== DEFAULT_WATERMARK_MODE,
        )}
        fontScale={fontScale}
        onFontScaleChange={setFontScale}
        pageNumberMode={pageNumberMode}
        onPageNumberModeChange={setPageNumberMode}
        watermarkMode={watermarkMode}
        onWatermarkModeChange={setWatermarkMode}
        onReset={resetAppearanceToTheme}
        onLockedPreset={() => setUpsellOpen(true)}
        presentationTitle={presentation?.title || ""}
        historySlideIndex={historySlideSafe}
        onHistorySlideIndexChange={setHistorySlideIndex}
        historyVersions={historyVersions}
        historyCurrentSlide={slides[historySlideSafe] || null}
        historyPreviewChrono={historyPreviewChrono}
        onHistoryPreviewChange={(chrono) => {
          if (chrono != null) setCurrentSlide(historySlideSafe);
          setHistoryPreviewChrono(chrono);
        }}
        historyCompareChrono={historyCompareChrono}
        onHistoryCompareChange={setHistoryCompareChrono}
        onHistoryRestore={handleHistoryRestore}
        onHistoryDuplicate={handleHistoryDuplicate}
        localAiOpen={localAiOpen}
        onLocalAiOpenChange={setLocalAiOpen}
        localAiMessages={localAiMessages}
        onLocalAiMessagesChange={setLocalAiMessages}
        onSendLocalSlideAi={handleSendLocalSlideAi}
        localAiBusy={localAiBusy}
        persistBusy={persistBusy}
        deckAiBusy={deckAiBusy}
        onDeckAssist={handleApplyDeckAssist}
        onDeckAiBusyChange={setDeckAiBusy}
        onAuthRequest={() => setAuthOpen(true)}
        slidesLength={slides.length}
        overlayMode={sidebarOverlay}
        panelWidth={sidebarPanelWidth}
      />

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />
      <UpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </div>
  );
}

function RailDivider() {
  return <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />;
}

function RailSectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ink-3)",
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

/** Общий фон мини-слайда в сетках «Нумерация» и «Водяной знак». */
const RAIL_MINI_SLIDE_BG = "color-mix(in srgb, var(--ink) 7%, var(--surface))";

/** Синий прямоугольник-метка в углу превью (единый стиль для нумерации и знака). */
function RailCornerAccentMark({ style }) {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        width: 11,
        height: 5,
        borderRadius: 2,
        background: "var(--accent)",
        opacity: 0.9,
        ...style,
      }}
    />
  );
}

function RailMiniSlideNonePreview() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: RAIL_MINI_SLIDE_BG,
      }}
    >
      <Icon name="circle-slash" size={14} stroke={2} style={{ color: "var(--ink-4)" }} />
    </div>
  );
}

/** Компактное превью режима нумерации (как полоска темы, высота 40px). */
function RailPageNumberSchemePreview({ mode }) {
  if (mode === PAGE_NUMBER_MODE_NONE) {
    return <RailMiniSlideNonePreview />;
  }
  if (mode === PAGE_NUMBER_MODE_CORNER_TR) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", background: RAIL_MINI_SLIDE_BG }}>
        <RailCornerAccentMark style={{ top: 8, right: 8 }} />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: RAIL_MINI_SLIDE_BG }}>
      <RailCornerAccentMark style={{ bottom: 8, right: 8 }} />
    </div>
  );
}

function RailPageNumberModePicker({ value, onChange }) {
  const options = [
    { id: PAGE_NUMBER_MODE_NONE, label: "Без номера", title: "Не показывать счётчик на слайде" },
    { id: PAGE_NUMBER_MODE_CORNER_BR, label: "Снизу справа", title: "Счётчик в правом нижнем углу слайда" },
    { id: PAGE_NUMBER_MODE_CORNER_TR, label: "Сверху справа", title: "Счётчик в правом верхнем углу слайда" },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.id)}
            aria-label={opt.label}
            aria-pressed={selected}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 40,
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                display: "flex",
                boxSizing: "border-box",
                outline: selected ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                outlineOffset: -1,
                boxShadow: selected
                  ? "0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)"
                  : "0 0 0 1px rgba(15,31,58,.12)",
                transition: "outline-color 0.15s, box-shadow 0.15s",
              }}
            >
              <RailPageNumberSchemePreview mode={opt.id} />
            </div>
            <span
              style={{
                fontSize: 9.5,
                lineHeight: 1.2,
                color: "var(--ink-3)",
                textAlign: "center",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Превью режима водяного знака — те же синие прямоугольники и «нет», что у нумерации. */
function RailWatermarkSchemePreview({ mode }) {
  if (mode === WATERMARK_MODE_NONE) {
    return <RailMiniSlideNonePreview />;
  }
  if (mode === WATERMARK_MODE_CORNER_BR) {
    return (
      <div style={{ width: "100%", height: "100%", position: "relative", background: RAIL_MINI_SLIDE_BG }} aria-hidden>
        <RailCornerAccentMark style={{ bottom: 8, right: 8 }} />
      </div>
    );
  }
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: RAIL_MINI_SLIDE_BG }} aria-hidden>
      <RailCornerAccentMark style={{ top: 8, right: 8 }} />
    </div>
  );
}

function RailWatermarkPicker({ value, onChange, userPlan, onLocked, publicView }) {
  const canHide = canHideWatermark(userPlan);
  const options = [
    {
      mode: WATERMARK_MODE_NONE,
      label: "Без знака",
      title: canHide ? "Не показывать знак на слайде" : "Снять знак можно только на тарифе Pro",
      locked: !canHide,
    },
    {
      mode: WATERMARK_MODE_CORNER_BR,
      label: "Снизу справа",
      title: "Подпись SlideUp в правом нижнем углу",
      locked: false,
    },
    {
      mode: WATERMARK_MODE_CORNER_TR,
      label: "Сверху справа",
      title: "Подпись SlideUp в правом верхнем углу",
      locked: false,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
      {options.map((opt) => {
        const selected = value === opt.mode;
        const locked = opt.locked;
        return (
          <button
            key={opt.mode}
            type="button"
            title={opt.title}
            onClick={() => {
              if (publicView) return;
              if (locked) {
                onLocked?.();
                return;
              }
              onChange(opt.mode);
            }}
            aria-label={opt.label}
            aria-pressed={selected}
            aria-disabled={publicView || undefined}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              border: "none",
              background: "none",
              padding: 0,
              cursor: publicView ? "not-allowed" : "pointer",
              opacity: publicView ? 0.55 : locked ? 0.58 : 1,
              transition: "opacity 0.15s",
            }}
          >
            <div
              style={{
                width: "100%",
                height: 40,
                borderRadius: 8,
                overflow: "hidden",
                position: "relative",
                display: "flex",
                boxSizing: "border-box",
                outline: selected ? "2.5px solid var(--accent)" : "2.5px solid transparent",
                outlineOffset: -1,
                boxShadow: selected
                  ? "0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)"
                  : "0 0 0 1px rgba(15,31,58,.12)",
                transition: "outline-color 0.15s, box-shadow 0.15s",
              }}
            >
              <RailWatermarkSchemePreview mode={opt.mode} />
              {locked ? (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(15,23,42,.38)",
                    color: "#fff",
                    borderRadius: "inherit",
                  }}
                  aria-hidden
                >
                  <Icon name="lock" size={12} stroke={2} />
                </span>
              ) : null}
            </div>
            <span
              style={{
                fontSize: 9.5,
                lineHeight: 1.2,
                color: "var(--ink-3)",
                textAlign: "center",
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const EDITOR_DOCK_WIDTH = 68;
const EDITOR_PANEL_WIDTH = 340;

function SidebarPanelHeader({ title, onClose, extra }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 14px",
        borderBottom: "1px solid var(--line)",
        background: "color-mix(in srgb, var(--surface) 88%, var(--surface-2))",
      }}
    >
      <h2
        style={{
          margin: 0,
          flex: 1,
          fontSize: 15,
          fontWeight: 750,
          letterSpacing: "-0.02em",
          color: "var(--ink)",
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {extra}
      <button
        type="button"
        aria-label="Закрыть панель"
        onClick={onClose}
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          border: "1px solid var(--line)",
          background: "var(--surface)",
          cursor: "pointer",
          display: "grid",
          placeItems: "center",
          color: "var(--ink-3)",
          flexShrink: 0,
          transition: "background 0.15s ease, color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--surface-2)";
          e.currentTarget.style.color = "var(--ink)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--surface)";
          e.currentTarget.style.color = "var(--ink-3)";
        }}
      >
        <Icon name="x" size={17} stroke={2} />
      </button>
    </div>
  );
}

function EditorDesignPanel({
  activePresetId,
  onPresetSelect,
  userPlan,
  customPresetActive,
  customPresetPreview,
  canPersistCustom,
  onCustomColorChange,
  onSaveCustomTheme,
  onApplySavedScheme,
  presentationId,
  themeSaveBusy,
  onLockedPreset,
  publicView,
  fontScale,
  onFontScaleChange,
  pageNumberMode,
  onPageNumberModeChange,
  watermarkMode,
  onWatermarkModeChange,
  onReset,
  hasOverrides,
}) {
  const [savedSchemes, setSavedSchemes] = useState([]);
  const [schemesLoaded, setSchemesLoaded] = useState(false);

  useEffect(() => {
    if (!customPresetActive || !canUseCustomTheme(userPlan) || schemesLoaded) return;
    apiJson("/api/color-schemes/")
      .then((data) => setSavedSchemes(Array.isArray(data) ? data : (data.results ?? [])))
      .catch(() => setSavedSchemes([]))
      .finally(() => setSchemesLoaded(true));
  }, [customPresetActive, userPlan, schemesLoaded]);

  return (
    <>
      <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)" }}>
        Пресеты темы и цвета слайдов. Изменения просматриваются сразу; часть опций сохраняется в файле презентации.
      </p>

      <RailSectionLabel>Тема и цветовая схема</RailSectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 14 }}>
        {[
          ...STYLE_PRESETS.map((p) => ({
            id: p.id,
            name: p.name,
            accent: p.accent,
            palette: Array.isArray(p.palette) && p.palette.length ? p.palette : [p.bg, p.ink, p.accent],
            locked: !canUnlockPreset(userPlan, p),
            isCustom: false,
          })),
          {
            id: CUSTOM_THEME_ID,
            name: "Своя тема",
            accent: customPresetPreview?.accent || "#2563eb",
            palette: [
              customPresetPreview?.bg || "#f8fafc",
              customPresetPreview?.ink || "#0f172a",
              customPresetPreview?.accent || "#2563eb",
            ],
            locked: !canUseCustomTheme(userPlan),
            isCustom: true,
          },
        ].map(({ id, name, accent, palette, locked, isCustom }) => {
          const selected = activePresetId === id;
          return (
            <button
              key={id}
              type="button"
              title={
                locked
                  ? `${name} — доступно на более высоком тарифе`
                  : isCustom
                    ? "Своя тема: задайте цвета и сохраните в файл"
                    : name
              }
              onClick={() => {
                if (locked) {
                  onLockedPreset?.();
                  return;
                }
                onPresetSelect(id);
              }}
              aria-label={name}
              aria-pressed={selected}
              aria-disabled={locked}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                border: "none",
                background: "none",
                padding: 0,
                cursor: locked ? "not-allowed" : "pointer",
                opacity: locked ? 0.58 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 40,
                  borderRadius: 8,
                  overflow: "hidden",
                  position: "relative",
                  display: "flex",
                  boxSizing: "border-box",
                  outline: selected ? `2.5px solid ${accent}` : "2.5px solid transparent",
                  outlineOffset: -1,
                  boxShadow: selected
                    ? `0 0 0 4px ${accent}2e`
                    : "0 0 0 1px rgba(15,31,58,.1)",
                  transition: "outline-color 0.15s, box-shadow 0.15s",
                }}
              >
                {isCustom ? (
                  <span
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: 5,
                      boxSizing: "border-box",
                      border: "1px dashed color-mix(in srgb, var(--line) 88%, var(--ink-3))",
                      borderRadius: 5,
                      background: "transparent",
                      color: locked ? "var(--ink-3)" : "var(--ink-2)",
                    }}
                    aria-hidden
                  >
                    <Icon name={locked ? "lock" : "plus"} size={locked ? 14 : 18} stroke={2} />
                  </span>
                ) : (
                  palette.map((hex, i) => (
                    <div key={i} aria-hidden style={{ flex: 1, background: hex }} />
                  ))
                )}
                {locked && !isCustom && (
                  <span
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(15,23,42,.38)",
                      color: "#fff",
                      borderRadius: "inherit",
                    }}
                    aria-hidden
                  >
                    <Icon name="lock" size={12} stroke={2} />
                  </span>
                )}
              </div>
              <span
                style={{
                  fontSize: 9.5,
                  lineHeight: 1.2,
                  color: "var(--ink-3)",
                  textAlign: "center",
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </span>
            </button>
          );
        })}
      </div>

      {customPresetActive && canUseCustomTheme(userPlan) ? (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)" }}>Мои схемы</div>
            <button
              type="button"
              onClick={() => navigate(`/personalization?from=${presentationId}`)}
              style={{
                fontSize: 11,
                color: "var(--accent)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "2px 0",
                display: "flex",
                alignItems: "center",
                gap: 3,
              }}
            >
              Управлять
              <Icon name="arrow-up-right" size={11} />
            </button>
          </div>

          {savedSchemes.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 12 }}>
              {savedSchemes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.name}
                  onClick={() => onApplySavedScheme?.(s)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    border: "none",
                    background: "none",
                    padding: 0,
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: 28,
                      borderRadius: 6,
                      overflow: "hidden",
                      display: "flex",
                      boxShadow: "0 0 0 1px rgba(15,31,58,.1)",
                    }}
                  >
                    <div style={{ flex: 3, background: s.bg }} />
                    <div style={{ flex: 2, background: s.accent }} />
                    <div style={{ flex: 1, background: s.ink }} />
                  </div>
                  <span
                    style={{
                      fontSize: 8.5,
                      color: "var(--ink-3)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: "100%",
                    }}
                  >
                    {s.name}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              style={{
                fontSize: 11,
                color: "var(--ink-3)",
                marginBottom: 10,
                padding: "8px 0",
                textAlign: "center",
              }}
            >
              Схем нет.{" "}
              <button
                type="button"
                onClick={() => navigate(`/personalization?from=${presentationId}`)}
                style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Создать
              </button>
            </div>
          )}

          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>Свои цвета</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {[
              { key: "bg", label: "Фон" },
              { key: "ink", label: "Текст" },
              { key: "accent", label: "Акцент" },
            ].map(({ key, label }) => (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  fontSize: 12,
                  color: "var(--ink-2)",
                }}
              >
                <span>{label}</span>
                <input
                  type="color"
                  value={
                    typeof customPresetPreview?.[key] === "string" && customPresetPreview[key].startsWith("#")
                      ? customPresetPreview[key]
                      : `#${String(customPresetPreview?.[key] || "808080").replace("#", "").slice(0, 6)}`
                  }
                  onChange={(e) => onCustomColorChange(key, e.target.value)}
                  disabled={publicView}
                  style={{
                    width: 44,
                    height: 26,
                    padding: 0,
                    border: "1px solid var(--line)",
                    borderRadius: 6,
                    cursor: publicView ? "not-allowed" : "pointer",
                    background: "var(--surface)",
                  }}
                />
              </label>
            ))}
          </div>
          {canPersistCustom ? (
            <button
              type="button"
              className="su-btn su-btn-accent"
              disabled={themeSaveBusy || publicView}
              onClick={onSaveCustomTheme}
              style={{ width: "100%", marginTop: 10, fontSize: 12 }}
            >
              {themeSaveBusy ? "Сохранение…" : "Сохранить в презентацию"}
            </button>
          ) : null}
        </div>
      ) : null}

      <RailDivider />

      <RailSectionLabel>Масштаб содержимого</RailSectionLabel>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <label style={{ fontSize: 12, color: "var(--ink-2)" }} title="Текст и элементы внутри слайда">
          Содержимое слайда
        </label>
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--accent)", fontWeight: 700 }}>
          {Math.round(fontScale * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={50}
        max={150}
        step={1}
        value={Math.round(fontScale * 100)}
        onChange={(e) => onFontScaleChange(Number(e.target.value) / 100)}
        style={{ width: "100%", marginBottom: 12, accentColor: "var(--accent)" }}
      />

      <RailDivider />

      <RailSectionLabel>Нумерация слайдов</RailSectionLabel>
      <RailPageNumberModePicker value={pageNumberMode} onChange={onPageNumberModeChange} />

      <RailSectionLabel>Водяной знак</RailSectionLabel>
      <RailWatermarkPicker
        value={watermarkMode}
        onChange={onWatermarkModeChange}
        userPlan={userPlan}
        onLocked={onLockedPreset}
        publicView={publicView}
      />

      <div style={{ height: 12 }} />
    </>
  );
}

const AI_QUICK_ACTIONS = [
  { id: "structure", label: "Улучшить структуру и логику всей презентации" },
  { id: "style", label: "Привести формулировки к единому уверенному тону" },
  { id: "shorten", label: "Сократить текст на всех слайдах, сохранив смысл" },
  { id: "hierarchy", label: "Сделать заголовки короче и заметнее" },
  { id: "logic", label: "Убрать повторы между слайдами" },
];

function EditorAiPanel({ presentationTitle, presentationId, publicView, busy, onBusyChange, onApplyDeckAssist, onAuthRequest }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      text: "Здесь ИИ видит всю презентацию целиком. После применения у каждого слайда появится новая версия в разделе «История слайда». Для точечных правок откройте историю конкретного слайда.",
    },
  ]);

  async function runInstruction(text) {
    if (publicView) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (!getAccessToken()) {
      onAuthRequest();
      return;
    }
    setMessages((m) => [...m, { role: "user", text: trimmed }]);
    onBusyChange(true);
    try {
      await onApplyDeckAssist(trimmed);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Изменения применены ко всем слайдам. Проверьте результат на холсте и в истории версий.",
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err.message || "Запрос не выполнен." }]);
    } finally {
      onBusyChange(false);
    }
  }

  function submitPrompt() {
    const p = prompt.trim();
    if (!p) return;
    void runInstruction(p);
    setPrompt("");
  }

  return (
    <>
      <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
        Презентация «{presentationTitle || "без названия"}» — правки по всему файлу сразу (без смены числа слайдов).
      </p>

      <RailSectionLabel>Диалог</RailSectionLabel>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid var(--line)",
          background: "color-mix(in srgb, var(--surface-2) 55%, var(--surface))",
          padding: 10,
          maxHeight: 200,
          overflowY: "auto",
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "92%",
              padding: "8px 11px",
              borderRadius: 10,
              fontSize: 12.5,
              lineHeight: 1.4,
              background: msg.role === "user" ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--surface)",
              border: msg.role === "user" ? "1px solid color-mix(in srgb, var(--accent) 22%, transparent)" : "1px solid var(--line)",
              color: "var(--ink-2)",
            }}
          >
            {msg.text}
          </div>
        ))}
      </div>

      <RailSectionLabel>Быстрые действия</RailSectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
        {AI_QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => void runInstruction(a.label)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "var(--surface)",
              fontSize: 12.5,
              color: "var(--ink-2)",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.65 : 1,
              transition: "border-color 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              if (busy) return;
              e.currentTarget.style.borderColor = "color-mix(in srgb, var(--accent) 28%, var(--line))";
              e.currentTarget.style.boxShadow = "0 2px 10px rgba(37,99,235,.08)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--line)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <RailSectionLabel>Свой запрос</RailSectionLabel>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Опишите, что изменить по всей презентации…"
        rows={3}
        disabled={busy}
        style={{
          width: "100%",
          boxSizing: "border-box",
          resize: "vertical",
          minHeight: 72,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid var(--line)",
          fontSize: 13,
          fontFamily: "inherit",
          color: "var(--ink)",
          background: "var(--surface)",
          marginBottom: 8,
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submitPrompt();
          }
        }}
      />
      <button
        type="button"
        className="su-btn su-btn-accent"
        style={{ width: "100%", fontSize: 12, marginBottom: 14 }}
        disabled={busy || !prompt.trim()}
        onClick={submitPrompt}
      >
        {busy ? "Обрабатываем…" : "Применить"}
        <span style={{ opacity: 0.75, fontWeight: 500, marginLeft: 6 }}>Ctrl+Enter</span>
      </button>

      <p style={{ margin: 0, fontSize: 11, color: "var(--ink-4)", lineHeight: 1.4 }}>
        Списывается одна правка по тарифу за запрос. ID: {presentationId ? String(presentationId).slice(0, 8) : "—"}…
      </p>
      <div style={{ height: 8 }} />
    </>
  );
}

function EditorExportPanel({ publicView, pdfLocked, onDownload, onPdfLocked, onShare, onDemo }) {
  const btnBase = {
    width: "100%",
    marginBottom: 8,
    fontSize: 13,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--line)",
    background: "var(--surface)",
    color: "var(--ink-2)",
    cursor: "pointer",
    transition: "border-color 0.15s, box-shadow 0.15s",
    textAlign: "left",
  };

  return (
    <>
      <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.45 }}>
        Экспорт и демонстрация не перегружают холст — всё в одном месте.
      </p>

      <button
        type="button"
        style={{
          ...btnBase,
          background: publicView ? "color-mix(in srgb, var(--accent) 10%, var(--surface))" : "var(--surface)",
          borderColor: publicView ? "color-mix(in srgb, var(--accent) 25%, var(--line))" : "var(--line)",
        }}
        onClick={onDemo}
      >
        <Icon name="play" size={18} stroke={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span>
          <span style={{ display: "block", fontWeight: 650, color: "var(--ink)" }}>Демонстрация</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Полноэкранный просмотр</span>
        </span>
      </button>

      <button type="button" style={btnBase} onClick={() => onDownload("pptx")}>
        <Icon name="download" size={18} stroke={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span>
          <span style={{ display: "block", fontWeight: 650, color: "var(--ink)" }}>Скачать PPTX</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>PowerPoint</span>
        </span>
      </button>

      <button
        type="button"
        style={{
          ...btnBase,
          opacity: pdfLocked ? 0.85 : 1,
          marginBottom: 8,
        }}
        onClick={() => (pdfLocked ? onPdfLocked() : onDownload("pdf"))}
      >
        <Icon name="download" size={18} stroke={2} style={{ color: "var(--accent)", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontWeight: 650, color: "var(--ink)" }}>Скачать PDF</span>
          <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{pdfLocked ? "Доступно на более высоком тарифе" : "Документ для печати"}</span>
        </span>
        {pdfLocked ? <Icon name="lock" size={16} stroke={2} style={{ color: "var(--ink-4)" }} /> : null}
      </button>

      {!publicView ? (
        <button
          type="button"
          className="su-btn su-btn-accent"
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 12,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 0,
          }}
          onClick={onShare}
        >
          <Icon name="share" size={18} stroke={2} />
          Поделиться ссылкой
        </button>
      ) : (
        <p style={{ margin: 0, fontSize: 12, color: "var(--ink-4)" }}>В режиме просмотра по ссылке доступны только экспорт и демонстрация.</p>
      )}
      <div style={{ height: 8 }} />
    </>
  );
}

function EditorRightSidebar({
  activePanel,
  onActivePanelChange,
  activePresetId,
  onPresetSelect,
  userPlan,
  customPresetActive,
  customPresetPreview,
  canPersistCustom,
  onCustomColorChange,
  onSaveCustomTheme,
  onApplySavedScheme,
  presentationId,
  presentationTitle,
  themeSaveBusy,
  onLockedPreset,
  hasOverrides,
  publicView,
  pdfLocked,
  onDownload,
  onPdfLocked,
  onShare,
  onDemo,
  fontScale,
  onFontScaleChange,
  pageNumberMode,
  onPageNumberModeChange,
  watermarkMode,
  onWatermarkModeChange,
  onReset,
  historySlideIndex,
  onHistorySlideIndexChange,
  historyVersions,
  historyCurrentSlide,
  historyPreviewChrono,
  onHistoryPreviewChange,
  historyCompareChrono,
  onHistoryCompareChange,
  onHistoryRestore,
  onHistoryDuplicate,
  localAiOpen,
  onLocalAiOpenChange,
  localAiMessages,
  onLocalAiMessagesChange,
  onSendLocalSlideAi,
  localAiBusy,
  persistBusy,
  deckAiBusy,
  onDeckAssist,
  onDeckAiBusyChange,
  onAuthRequest,
  slidesLength,
  overlayMode,
  panelWidth,
}) {
  const dock = [
    { id: "design", title: "Дизайн презентации", icon: "palette" },
    ...(!publicView ? [{ id: "ai", title: "ИИ презентации", icon: "sparkles" }] : []),
    { id: "export", title: "Экспорт", icon: "download" },
  ];

  function toggleDock(id) {
    onActivePanelChange((p) => (p === id ? null : id));
  }

  const resetChip =
    hasOverrides && activePanel === "design" ? (
      <button
        type="button"
        onClick={onReset}
        title="Сбросить оформление к теме файла"
        aria-label="Сбросить оформление"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 9px",
          borderRadius: 8,
          border: "1px solid rgba(37,99,235,.18)",
          background: "rgba(37,99,235,.07)",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--accent)",
          cursor: "pointer",
        }}
      >
        <Icon name="rotate-ccw" size={12} stroke={2} />
        Сбросить
      </button>
    ) : null;

  const titles = {
    design: "Дизайн презентации",
    ai: "ИИ презентации",
    history: "История слайда",
    export: "Экспорт",
  };

  const panelBusy = persistBusy || localAiBusy || deckAiBusy;

  return (
    <>
      {overlayMode && activePanel ? (
        <button
          type="button"
          aria-label="Закрыть боковую панель"
          onClick={() => onActivePanelChange(null)}
          style={{
            position: "fixed",
            inset: "88px 0 24px 0",
            zIndex: 44,
            border: "none",
            background: "rgba(11,31,58,.16)",
            backdropFilter: "blur(4px)",
          }}
        />
      ) : null}
      <div
        className="editor-right-sidebar"
        style={{
          position: "fixed",
          right: 0,
          top: 88,
          bottom: 24,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          zIndex: 45,
          borderRadius: "18px 0 0 18px",
          overflow: "hidden",
          border: "1px solid var(--line)",
          borderRight: "none",
          boxShadow: activePanel
            ? overlayMode
              ? "-18px 0 52px rgba(15,31,58,.16)"
              : "-12px 0 48px rgba(15,31,58,.07)"
            : "-4px 0 22px rgba(15,31,58,.05)",
          transition: "box-shadow 0.22s ease",
        }}
      >
      {activePanel ? (
        <div
          style={{
            width: panelWidth,
            flexShrink: 0,
            background: "var(--surface)",
            borderRight: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            maxWidth: "calc(100vw - 92px)",
          }}
        >
          <SidebarPanelHeader
            title={titles[activePanel] || ""}
            onClose={() => onActivePanelChange(null)}
            extra={activePanel === "design" ? resetChip : null}
          />
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: "16px 18px 20px" }}>
            {activePanel === "design" ? (
              <EditorDesignPanel
                activePresetId={activePresetId}
                onPresetSelect={onPresetSelect}
                userPlan={userPlan}
                customPresetActive={customPresetActive}
                customPresetPreview={customPresetPreview}
                canPersistCustom={canPersistCustom}
                onCustomColorChange={onCustomColorChange}
                onSaveCustomTheme={onSaveCustomTheme}
                onApplySavedScheme={onApplySavedScheme}
                presentationId={presentationId}
                themeSaveBusy={themeSaveBusy}
                onLockedPreset={onLockedPreset}
                publicView={publicView}
                fontScale={fontScale}
                onFontScaleChange={onFontScaleChange}
                pageNumberMode={pageNumberMode}
                onPageNumberModeChange={onPageNumberModeChange}
                watermarkMode={watermarkMode}
                onWatermarkModeChange={onWatermarkModeChange}
                onReset={onReset}
                hasOverrides={hasOverrides}
              />
            ) : null}
            {activePanel === "ai" ? (
              <EditorAiPanel
                presentationTitle={presentationTitle}
                presentationId={presentationId}
                publicView={publicView}
                busy={deckAiBusy}
                onBusyChange={onDeckAiBusyChange}
                onApplyDeckAssist={onDeckAssist}
                onAuthRequest={onAuthRequest}
              />
            ) : null}
            {activePanel === "history" ? (
              <SlideHistoryTab
                slideIndex={historySlideIndex}
                slidesLen={slidesLength}
                onSlideIndexChange={onHistorySlideIndexChange}
                versionsChrono={historyVersions}
                currentSlide={historyCurrentSlide}
                preset={customPresetPreview}
                previewChronoIndex={historyPreviewChrono}
                onSetPreview={onHistoryPreviewChange}
                compareChronoIndex={historyCompareChrono}
                onSetCompare={onHistoryCompareChange}
                busy={panelBusy}
                onRestore={onHistoryRestore}
                onDuplicate={onHistoryDuplicate}
                publicView={publicView}
                localAiOpen={localAiOpen}
                onToggleLocalAi={onLocalAiOpenChange}
                localAiMessages={localAiMessages}
                onSendLocalAi={async (text, focusChrono) => {
                  onLocalAiMessagesChange((m) => [...m, { role: "user", text }]);
                  await onSendLocalSlideAi(text, focusChrono);
                }}
                localAiBusy={localAiBusy}
              />
            ) : null}
            {activePanel === "export" ? (
              <EditorExportPanel
                publicView={publicView}
                pdfLocked={pdfLocked}
                onDownload={onDownload}
                onPdfLocked={onPdfLocked}
                onShare={onShare}
                onDemo={onDemo}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        style={{
          width: EDITOR_DOCK_WIDTH,
          flexShrink: 0,
          background: "linear-gradient(180deg, var(--surface) 0%, color-mix(in srgb, var(--surface-2) 92%, var(--surface)) 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "16px 0",
          gap: 14,
          boxSizing: "border-box",
        }}
      >
        {dock.map((item) => {
          const on = activePanel === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.title}
              aria-label={item.title}
              aria-pressed={on}
              onClick={() => toggleDock(item.id)}
              style={{
                width: 52,
                height: 52,
                borderRadius: 14,
                border: on ? "2px solid color-mix(in srgb, var(--accent) 42%, transparent)" : "1px solid var(--line)",
                background: on ? "color-mix(in srgb, var(--accent) 11%, var(--surface))" : "var(--surface)",
                boxShadow: on ? "0 4px 16px rgba(37,99,235,.14)" : "0 1px 4px rgba(15,31,58,.05)",
                cursor: "pointer",
                display: "grid",
                placeItems: "center",
                color: on ? "var(--accent)" : "var(--ink-2)",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, background 0.18s ease",
              }}
            >
              <Icon name={item.icon} size={24} stroke={on ? 2.1 : 1.85} />
            </button>
          );
        })}
      </div>
      </div>
    </>
  );
}

/** Inline-editable text field using contentEditable. When onChange is null, renders as plain tag. */
function EditableField({ value, onChange, tag: Tag = "div", style, ...rest }) {
  const ref = useRef(null);
  const active = useRef(false);

  useLayoutEffect(() => {
    if (!onChange) return;
    if (ref.current && !active.current) {
      const str = String(value ?? "");
      if (ref.current.textContent !== str) ref.current.textContent = str;
    }
  });

  if (!onChange) return <Tag style={style} {...rest}>{value}</Tag>;

  return (
    <Tag
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      style={{ ...style, outline: "none", cursor: "text", borderRadius: 4 }}
      onFocus={(e) => {
        active.current = true;
        e.currentTarget.style.boxShadow = "inset 0 0 0 1.5px rgba(37,99,235,.45)";
      }}
      onBlur={(e) => {
        active.current = false;
        e.currentTarget.style.boxShadow = "";
        const newVal = e.currentTarget.textContent;
        if (newVal !== String(value ?? "")) onChange(newVal);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.textContent = String(value ?? "");
          e.currentTarget.blur();
          e.preventDefault();
        }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          document.execCommand("insertLineBreak");
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
      onMouseEnter={(e) => {
        if (!active.current) e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(37,99,235,.25)";
      }}
      onMouseLeave={(e) => {
        if (!active.current) e.currentTarget.style.boxShadow = "";
      }}
      {...rest}
    />
  );
}

function InlineBarChart({ chart, preset, width, height }) {
  const data = chart?.data;
  if (!Array.isArray(data) || data.length < 2) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 0.001);
  const barCount = data.length;
  const padX = width * 0.04;
  const padTop = height * 0.1;
  const padBottom = height * 0.22;
  const chartH = height - padTop - padBottom;
  const totalW = width - padX * 2;
  const gap = Math.min(totalW * 0.08, 12);
  const barW = (totalW - gap * (barCount - 1)) / barCount;
  const labelFs = Math.max(9, Math.min(11, barW * 0.5));
  const valueFs = Math.max(9, Math.min(12, barW * 0.5));

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: "visible", display: "block" }}>
      {chart.title && (
        <text x={width / 2} y={padTop * 0.65} textAnchor="middle"
          fontSize={Math.max(10, Math.min(13, width * 0.038))} fill={preset.ink} opacity={0.55}
          fontFamily="var(--font-display)">{chart.title}</text>
      )}
      {data.map((point, i) => {
        const barH = Math.max(4, (point.value / maxVal) * chartH);
        const x = padX + i * (barW + gap);
        const y = padTop + chartH - barH;
        const label = String(point.label);
        const displayLabel = label.length > 9 ? label.slice(0, 8) + "…" : label;
        const displayVal = Number.isInteger(point.value) ? point.value : point.value.toFixed(1);
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={barH} rx={Math.max(2, barW * 0.1)}
              fill={preset.accent} opacity={0.82} />
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={valueFs}
              fontWeight="700" fill={preset.accent} fontFamily="var(--font-display)">{displayVal}</text>
            <text x={x + barW / 2} y={padTop + chartH + padBottom * 0.5} textAnchor="middle"
              fontSize={labelFs} fill={preset.ink} opacity={0.6} fontFamily="var(--font-mono)">{displayLabel}</text>
          </g>
        );
      })}
      <line x1={padX} y1={padTop + chartH} x2={width - padX} y2={padTop + chartH}
        stroke={preset.ink} strokeOpacity={0.12} strokeWidth={1} />
    </svg>
  );
}

function SlideCanvas({
  slide,
  index,
  total,
  preset,
  fontScale,
  pageNumberMode = DEFAULT_PAGE_NUMBER_MODE,
  watermarkMode = DEFAULT_WATERMARK_MODE,
  slideWidth = null,
  slideHeight = null,
  onSlideChange = null,
  assets = null,
}) {
  const showCornerTR = pageNumberMode === PAGE_NUMBER_MODE_CORNER_TR;
  const showCornerBR = pageNumberMode === PAGE_NUMBER_MODE_CORNER_BR;
  const showWmTR = watermarkMode === WATERMARK_MODE_CORNER_TR;
  const showWmBR = watermarkMode === WATERMARK_MODE_CORNER_BR;

  const pageCounterText = `${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const bullets = getSlideBullets(slide).slice(0, 6);
  const stats = getSlideStats(slide).slice(0, 4);
  const subtitle = getSlideSubtitle(slide);
  const W = slideWidth || 1200;
  const H = slideHeight || Math.round((W * 9) / 16);
  const layoutUnit = (W / 1200) * fontScale;

  const icon = typeof slide?.icon === "string" ? slide.icon.trim() : "";
  const chart = slide?.chart && Array.isArray(slide.chart.data) && slide.chart.data.length >= 2 ? slide.chart : null;
  const slideImageSrc = slide?.image === true && assets?.images?.[0]
    ? `data:${assets.images[0].media_type};base64,${assets.images[0].data_b64}`
    : null;
  const hasRightPanel = !!(chart || slideImageSrc || stats.length > 0);
  const rightPanelW = Math.round(W * 0.4);
  const rightPanelH = Math.round(H * 0.72);

  const sp = (vwVal, min, max) => {
    const raw = (vwVal / 100) * W * fontScale;
    return `${Math.round(Math.max(min, raw))}px`;
  };

  const watermarkLabelStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: sp(1.1, 10, 14),
    color: preset.accent,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    whiteSpace: "nowrap",
  };

  const pageCounterStyle = {
    fontFamily: "var(--font-mono)",
    fontSize: sp(1.1, 10, 13),
    opacity: 0.48,
    whiteSpace: "nowrap",
  };

  const chromeGap = Math.max(8, Math.round(10 * layoutUnit));

  const frameStyle = slideWidth && slideHeight
    ? {
        width: slideWidth,
        height: slideHeight,
        flexShrink: 0,
        borderRadius: 12,
        background: preset.bg,
        color: preset.ink,
        position: "relative",
        overflow: "hidden",
      }
    : {
        aspectRatio: "16 / 9",
        width: "100%",
        borderRadius: 12,
        background: preset.bg,
        color: preset.ink,
        position: "relative",
        overflow: "hidden",
      };

  const canvasInner = (
    <div
      style={{
        width: W,
        height: H,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        padding: "6.5%",
        boxSizing: "border-box",
      }}
    >
      {/* Top chrome: icon left, watermark+counter right */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5%", flexShrink: 0 }}>
        <div style={{ fontSize: sp(3.2, 20, 40), lineHeight: 1, userSelect: "none" }}>
          {icon || null}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: chromeGap,
            pointerEvents: "none",
          }}
        >
          {showWmTR ? <div style={watermarkLabelStyle}>SlideUp</div> : null}
          {showCornerTR ? <div style={pageCounterStyle}>{pageCounterText}</div> : null}
        </div>
      </div>

      {/* Main grid: text left, visual panel right */}
      <div style={{ display: "grid", gridTemplateColumns: hasRightPanel ? "54% 42%" : "1fr", gap: "4%", alignItems: "center", flex: 1, minHeight: 0 }}>
        <div style={{ minWidth: 0 }}>
          <EditableField
            tag="h1"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: hasRightPanel ? sp(4.2, 26, 62) : sp(5.2, 32, 78),
              lineHeight: 1.02,
              letterSpacing: "-0.035em",
              margin: 0,
              maxWidth: hasRightPanel ? "100%" : "76%",
            }}
            value={getSlideTitle(slide, index)}
            onChange={onSlideChange ? (v) => onSlideChange({ ...slide, title: v }) : null}
          />
          {subtitle && (
            <EditableField
              tag="p"
              style={{
                fontSize: sp(1.8, 15, 26),
                lineHeight: 1.35,
                color: preset.accent,
                margin: "4% 0 0",
                maxWidth: hasRightPanel ? "100%" : "63%",
              }}
              value={subtitle}
              onChange={onSlideChange ? (v) => onSlideChange({ ...slide, subtitle: v }) : null}
            />
          )}
          {!subtitle && bullets.length > 0 && (
            <ul style={{ listStyle: "none", padding: 0, margin: "5% 0 0", display: "grid", gap: sp(1.2, 8, 16), maxWidth: hasRightPanel ? "100%" : "68%" }}>
              {bullets.map((item, bulletIndex) => (
                <li
                  key={bulletIndex}
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
                    {String(bulletIndex + 1).padStart(2, "0")}
                  </span>
                  <EditableField
                    tag="span"
                    value={String(item)}
                    onChange={onSlideChange ? (v) => {
                      const nb = bullets.map((b, i) => i === bulletIndex ? v : b);
                      onSlideChange({ ...slide, bullets: nb });
                    } : null}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right panel: chart > image > stats (priority order) */}
        {hasRightPanel && (
          <div style={{ minWidth: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {chart ? (
              <InlineBarChart chart={chart} preset={preset} width={rightPanelW} height={rightPanelH} />
            ) : slideImageSrc ? (
              <img
                src={slideImageSrc}
                alt=""
                style={{
                  maxWidth: "100%",
                  maxHeight: rightPanelH,
                  borderRadius: Math.round(10 * layoutUnit),
                  objectFit: "contain",
                  display: "block",
                }}
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5%", width: "100%" }}>
                {stats.map((stat, statIndex) => (
                  <div
                    key={statIndex}
                    style={{ borderTop: `3px solid ${preset.accent}`, paddingTop: "12%", minHeight: Math.round(110 * layoutUnit) }}
                  >
                    <EditableField
                      tag="div"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: sp(4.5, 28, 56),
                        fontWeight: 750,
                        letterSpacing: "-0.04em",
                        lineHeight: 1,
                      }}
                      value={String(stat.value ?? "")}
                      onChange={onSlideChange ? (v) => {
                        const ns = stats.map((s, i) => i === statIndex ? { ...s, value: v } : s);
                        onSlideChange({ ...slide, stats: ns });
                      } : null}
                    />
                    <EditableField
                      tag="div"
                      style={{ marginTop: Math.round(8 * layoutUnit), fontSize: sp(1.2, 12, 17), lineHeight: 1.3, opacity: 0.72 }}
                      value={String(stat.label ?? "")}
                      onChange={onSlideChange ? (v) => {
                        const ns = stats.map((s, i) => i === statIndex ? { ...s, label: v } : s);
                        onSlideChange({ ...slide, stats: ns });
                      } : null}
                    />
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
            right: "6.5%",
            bottom: "6.5%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            gap: chromeGap,
            pointerEvents: "none",
          }}
        >
          {showWmBR ? <div style={watermarkLabelStyle}>SlideUp</div> : null}
          {showCornerBR ? <div style={pageCounterStyle}>{pageCounterText}</div> : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <div style={frameStyle}>
      {canvasInner}
    </div>
  );
}

function SlideThumbnail({ slide, index, total, preset }) {
  return <DeckSlideThumbCanvas slide={slide} index={index} total={total} preset={preset} />;
}

function CanvasButton({ label, icon, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        display: "grid",
        placeItems: "center",
        background: "rgba(37,99,235,.12)",
        color: "inherit",
        border: "1px solid rgba(37,99,235,.18)",
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
