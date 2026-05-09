import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import UpsellModal from "@/components/UpsellModal";
import {
  Icon,
  PITCH_SLIDES,
  STYLE_PRESETS,
  CUSTOM_THEME_ID,
  buildCustomPreset,
  canUnlockPreset,
  canHideWatermark,
  canUseCustomTheme,
  normalizeLegacyThemeId,
  presentationStyleCaption,
} from "@/lib/design";
import { HERO_SOURCE_ACCEPT, Stepper, StylePicker, isHeroPromptValid, slidesDeclension } from "@/pages/Home";
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
import { DeckSlideThumbCanvas, getSlideBulletMarker, getSlideBullets, getSlideStats, getSlideSubtitle, getSlideTitle } from "@/lib/slidePreview";
import { buildRefineSlidePayload, getSafeSlideHtml, isHtmlSlide } from "@/lib/slideHtml";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/** Restrict drag translation to the vertical axis only. */
const restrictToVerticalAxis = ({ transform }) => ({ ...transform, x: 0 });

/** Clamp drag translation so the dragged node stays within its scrollable parent. */
const restrictToParentElement = ({ transform, draggingNodeRect, containerNodeRect }) => {
  if (!draggingNodeRect || !containerNodeRect) return transform;
  return {
    ...transform,
    x: Math.min(Math.max(transform.x, containerNodeRect.left - draggingNodeRect.left), containerNodeRect.right - draggingNodeRect.right),
    y: Math.min(Math.max(transform.y, containerNodeRect.top - draggingNodeRect.top), containerNodeRect.bottom - draggingNodeRect.bottom),
  };
};

/** Hook: returns true when viewport width <= breakpoint (default 768). */
function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.innerWidth <= breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

const VIEWER_STORAGE_PREFIX = "slideup-viewer-appearance:";

/** Масштаб текста и элементов внутри слайда (доля от базового размера). */
const FONT_SCALE_MIN = 0.7;
const FONT_SCALE_MAX = 1.3;

function clampFontScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
}

const PRESENTATION_TITLE_DISPLAY_MAX = 30;

/** Короткая подпись в шапке; полное имя — в title / aria-label. */
function truncatePresentationTitleDisplay(title) {
  const raw = (title || "").trim() || "Без названия";
  const chars = [...raw];
  if (chars.length <= PRESENTATION_TITLE_DISPLAY_MAX) return raw;
  return `${chars.slice(0, PRESENTATION_TITLE_DISPLAY_MAX).join("")}...`;
}

/** Рейка заголовка: полоска + зазор до текста — общий левый край шапки, подзаголовка и ленты слайдов. */
const PRESENTATION_TITLE_RAIL_BAR_PX = 3;
const PRESENTATION_TITLE_RAIL_GAP_PX = 12;
const PRESENTATION_TITLE_RAIL_SLOT_PX = PRESENTATION_TITLE_RAIL_BAR_PX + PRESENTATION_TITLE_RAIL_GAP_PX;

/** Режим отображения счётчика слайдов в просмотрщике. */
const PAGE_NUMBER_MODE_NONE = "none";
const PAGE_NUMBER_MODE_CORNER_BR = "corner_br";
const PAGE_NUMBER_MODE_CORNER_TR = "corner_tr";

const DEFAULT_PAGE_NUMBER_MODE = PAGE_NUMBER_MODE_CORNER_BR;

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

const DECK_AI_MODE_DECK = "deck";
const DECK_AI_MODE_APPEND_SLIDE = "append_slide";
const NEW_SLIDE_PROMPT_TEMPLATE = "Создай один новый слайд. Сохрани общий стиль презентации и логично продолжи текущую структуру. Тема слайда: \n";

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

export default function PresentationView(props) {
  if (props.createMode) {
    return <CreatePresentationWorkspace />;
  }
  return <ExistingPresentationView {...props} />;
}

function CreatePresentationWorkspace() {
  const [user, setUser] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [styleId, setStyleId] = useState("light");
  const [docFile, setDocFile] = useState(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState("login");
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [slideAreaEl, setSlideAreaEl] = useState(null);
  const [slideDims, setSlideDims] = useState(null);
  const fileInputRef = useRef(null);
  const pendingSlideCountAfterAuthRef = useRef(null);

  const sampleSlide = useMemo(
    () => PITCH_SLIDES.find((slide) => slide.kind === "cover") || PITCH_SLIDES[0] || null,
    [],
  );
  const previewPreset = useMemo(
    () => STYLE_PRESETS.find((item) => item.id === styleId) || STYLE_PRESETS[0],
    [styleId],
  );

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const plan = user?.plan || "free";
    const preset = STYLE_PRESETS.find((p) => p.id === styleId);
    if (preset && !canUnlockPreset(plan, preset)) {
      setStyleId("light");
    }
  }, [user?.plan, styleId]);

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

  async function handleCreate(options = {}) {
    setCreateErr("");
    if (!isHeroPromptValid(prompt)) {
      setCreateErr("Расскажите тему чуть подробнее — от 4 символов без лишних пробелов по краям.");
      return;
    }
    const trimmed = prompt.trim();
    const requestedSlideCount = options.slideCount ?? slideCount;

    if (docFile) {
      setCreateBusy(true);
      try {
        const fd = new FormData();
        fd.append("prompt", trimmed);
        fd.append("slides_count", String(requestedSlideCount));
        fd.append("theme", styleId);
        fd.append("source_file", docFile);
        const data = await apiJson("/api/generate/", { method: "POST", body: fd });
        sessionStorage.removeItem("genConfig");
        navigate(`/presentation/${data.id}`);
      } catch (e) {
        setCreateErr(e?.message || "Презентация не создалась — можно попробовать ещё раз чуть позже.");
      } finally {
        setCreateBusy(false);
      }
      return;
    }

    sessionStorage.setItem(
      "genConfig",
      JSON.stringify({
        prompt: trimmed,
        slides_count: requestedSlideCount,
        theme: styleId,
        source_file_name: "",
        source_mime: "",
      }),
    );
    navigate("/generating");
  }

  async function handleAuthSuccess() {
    const pending = pendingSlideCountAfterAuthRef.current;
    const intent = authIntent;
    pendingSlideCountAfterAuthRef.current = null;
    setAuthIntent("login");

    if (pending != null) setSlideCount(pending);

    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }

    if (intent === "continue-project") {
      await handleCreate({ slideCount: pending ?? slideCount });
      return;
    }

    navigate("/dashboard");
  }

  const activeStyleName = previewPreset?.name || "Светлый";
  const canSubmitCreate = isHeroPromptValid(prompt);

  return (
    <div
      className="su-page editor-dark"
      style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}
    >
      <AppHeader user={user} active="library" onLibrary={() => navigate("/dashboard")} onLogout={() => { logout(); navigate("/"); }} />

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
        }}
      >
        <section style={{ minWidth: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ marginBottom: 12, flexShrink: 0, minWidth: 0, padding: "4px 2px 0" }}>
            <div style={{ display: "flex", alignItems: "center", minWidth: 0, gap: 12, marginBottom: 6 }}>
              <h1
                style={{
                  margin: 0,
                  padding: 0,
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(22px, 2.65vw, 30px)",
                  lineHeight: 1.1,
                  letterSpacing: "-0.035em",
                  fontWeight: 750,
                  wordBreak: "break-word",
                }}
              >
                Новая презентация
              </h1>
            </div>
            <div style={{ marginTop: 5, display: "flex", gap: 10, alignItems: "center", color: "var(--ink-3)", fontSize: 12, flexWrap: "wrap" }}>
              <span>{slideCount} {slidesDeclension(slideCount)}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{activeStyleName}</span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{docFile?.name || "Только описание"}</span>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              background: "rgba(255,255,255,.72)",
              border: "1px solid var(--line)",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 1px 2px rgba(32,33,36,.04), 0 10px 28px rgba(32,33,36,.06)",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.15fr) minmax(360px, .85fr)", gap: 10, flex: 1, minHeight: 0 }}>
              <div
                ref={setSlideAreaEl}
                style={{
                  minHeight: 320,
                  minWidth: 0,
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 10,
                  background: "linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,.18))",
                  border: "1px solid color-mix(in srgb, var(--line) 88%, white)",
                }}
              >
                {slideDims && sampleSlide ? (
                  <SlideCanvas
                    slide={sampleSlide}
                    index={0}
                    total={slideCount}
                    preset={previewPreset}
                    fontScale={1}
                    pageNumberMode={DEFAULT_PAGE_NUMBER_MODE}
                    watermarkMode={DEFAULT_WATERMARK_MODE}
                    slideWidth={slideDims.w}
                    slideHeight={slideDims.h}
                    onSlideChange={null}
                  />
                ) : null}
              </div>

              <div
                style={{
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  padding: 14,
                  borderRadius: 10,
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                }}
              >
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 10 }}>
                    Запрос к SlideUp
                  </div>
                  <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 13, lineHeight: 1.45 }}>
                    Опишите тему, аудиторию и результат. Мы оставили тот же workspace, что и в редакторе, но вместо готовых слайдов здесь форма создания.
                  </p>
                </div>

                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && canSubmitCreate && !createBusy) {
                      void handleCreate();
                    }
                  }}
                  placeholder="Например: стратегия запуска ИИ-продукта для B2B SaaS на 5 слайдов"
                  className="hero-textarea"
                  style={{ minHeight: 220, margin: 0, flex: 1 }}
                />

                {docFile ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--accent-soft)", borderRadius: "var(--r-md)", fontSize: 13 }}>
                    <Icon name="paperclip" size={13} style={{ color: "var(--accent)" }} />
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{docFile.name}</span>
                    <button type="button" onClick={() => setDocFile(null)} style={{ color: "var(--ink-3)" }}>
                      <Icon name="x" size={12} />
                    </button>
                  </div>
                ) : null}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={HERO_SOURCE_ACCEPT}
                  style={{ display: "none" }}
                  onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
                />

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="hero-attach-btn"
                      aria-label="Вложить файл"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Icon name="paperclip" size={18} stroke={2} />
                    </button>
                    <StylePicker value={styleId} onChange={setStyleId} userPlan={user?.plan || "free"} onLockedPreset={() => setUpsellOpen(true)} />
                    <Stepper
                      count={slideCount}
                      setCount={setSlideCount}
                      isLoggedIn={Boolean(user)}
                      onRequestMoreSlidesLogin={(nextCount) => {
                        pendingSlideCountAfterAuthRef.current = nextCount;
                        setAuthIntent("continue-project");
                        setAuthOpen(true);
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="su-btn su-btn-accent"
                    disabled={createBusy || !canSubmitCreate}
                    onClick={() => void handleCreate()}
                    style={{ fontSize: 15 }}
                  >
                    {createBusy ? "Создаём…" : <>Создать <Icon name="arrow-right" size={16} /></>}
                  </button>
                </div>

                {createErr ? <div className="su-user-hint" style={{ marginTop: 4 }}>{createErr}</div> : (
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
                    Ctrl/Cmd + Enter для быстрого запуска генерации.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={handleAuthSuccess} />
      <UpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </div>
  );
}

function ExistingPresentationView({ id, publicView = false }) {
  const canvasRef = useRef(null);
  const pendingDownloadRef = useRef(null);
  const titleEditDismissRef = useRef(false);
  const [slideAreaEl, setSlideAreaEl] = useState(null);
  const [slideDims, setSlideDims] = useState(null);
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

  const [designModalOpen, setDesignModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
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
  const [appendSlideBusy, setAppendSlideBusy] = useState(false);
  const [deckAiPromptSeed, setDeckAiPromptSeed] = useState(null);
  const [persistBusy, setPersistBusy] = useState(false);

  // A4: Dark mode
  const [darkMode, setDarkMode] = useState(() => {
    try { return localStorage.getItem("slideup-editor-dark-mode") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("slideup-editor-dark-mode", String(darkMode)); } catch { /* ignore */ }
  }, [darkMode]);

  // A6: Mobile AI overlay
  const isMobile = useIsMobile(768);
  const [mobileAiOpen, setMobileAiOpen] = useState(false);

  // B1: Slide menu (delete / duplicate)
  const [slideMenuIndex, setSlideMenuIndex] = useState(null);
  useEffect(() => {
    if (slideMenuIndex == null) return;
    const close = () => setSlideMenuIndex(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [slideMenuIndex]);

  // B2: Undo/Redo
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);

  // B8: Save indicator
  const [saveStatus, setSaveStatus] = useState("idle");
  const saveTimerRef = useRef(null);

  const slides = Array.isArray(presentation?.slides) ? presentation.slides : [];

  const unlockedSlideCount = useMemo(() => {
    const len = slides.length;
    if (!len) return 0;
    const raw = presentation?.slides_unlocked;
    if (raw == null || raw === "") return len;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n < 1) return len;
    return Math.min(n, len);
  }, [presentation?.slides_unlocked, slides.length]);

  const lastUnlockedSlideIndex = Math.max(0, unlockedSlideCount - 1);

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
      setNotice("Укажите хотя бы один цвет в формате #RRGGBB.");
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
      setNotice(err.message || "Тему сейчас не удалось сохранить — попробуйте ещё раз.");
    } finally {
      setThemeSaveBusy(false);
    }
  }, [publicView, presentation?.id, userPlan, id]);

  const selectedSlide = slides[currentSlide] || null;
  const slideHistoriesMap = useMemo(() => normalizeHistoriesMap(presentation?.slide_histories), [presentation?.slide_histories]);

  /** B2: Push current state onto undo stack. Call before every mutation. */
  const pushUndo = useCallback(() => {
    if (!presentation) return;
    const entry = { slides: presentation.slides, slide_histories: presentation.slide_histories };
    undoStackRef.current = [...undoStackRef.current.slice(-29), entry];
    redoStackRef.current = [];
  }, [presentation]);

  const persistDeckPatch = useCallback(
    async (patch, successNotice) => {
      if (publicView || !presentation?.id) return;
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      setPersistBusy(true);
      setSaveStatus("saving");
      clearTimeout(saveTimerRef.current);
      setNotice("");
      try {
        const data = await apiJson(`/api/presentations/${id}/`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        setPresentation(data);
        if (successNotice) setNotice(successNotice);
        setSaveStatus("saved");
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      } catch (err) {
        const msg = err.message || "Изменения не сохранились — попробуйте ещё раз.";
        setNotice(msg);
        setSaveStatus("error");
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
    setHistorySlideIndex((idx) => Math.min(Math.max(0, idx), lastUnlockedSlideIndex));
  }, [lastUnlockedSlideIndex, slides.length]);

  useEffect(() => {
    if (!slides.length) return;
    setCurrentSlide((v) => Math.min(v, lastUnlockedSlideIndex));
  }, [slides.length, lastUnlockedSlideIndex]);

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

  const historySlideSafe = Math.min(
    Math.max(0, historySlideIndex),
    Math.max(0, Math.min(slides.length, unlockedSlideCount) - 1),
  );

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

  const appearanceHasOverrides = Boolean(
    (displayThemeId !== "" && normalizeLegacyThemeId(displayThemeId) !== normalizedDeckTheme) ||
      (Boolean(customColorDraft) && effectiveThemeId === CUSTOM_THEME_ID) ||
      fontScale !== 1 ||
      pageNumberMode !== DEFAULT_PAGE_NUMBER_MODE ||
      watermarkMode !== DEFAULT_WATERMARK_MODE,
  );

  const slideForCanvas = useMemo(() => {
    if (historyPreviewChrono == null || !selectedSlide?.[SLIDE_SID_KEY]) return selectedSlide;
    const chain = slideHistoriesMap[selectedSlide[SLIDE_SID_KEY]];
    const snap = chain?.[historyPreviewChrono]?.slide;
    return snap || selectedSlide;
  }, [historyPreviewChrono, selectedSlide, slideHistoriesMap]);

  const applyRefinedSlideAtIndex = useCallback(
    async (slideIndex, refinedSlide, summary, source = "ai") => {
      if (!presentation) return;
      pushUndo();
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
    async (instruction, options = {}) => {
      if (!presentation || publicView) return;
      pushUndo();
      if (!getAccessToken()) {
        setAuthOpen(true);
        return;
      }
      const mode = options?.mode === DECK_AI_MODE_APPEND_SLIDE ? DECK_AI_MODE_APPEND_SLIDE : DECK_AI_MODE_DECK;
      setDeckAiBusy(true);
      if (mode === DECK_AI_MODE_APPEND_SLIDE) setAppendSlideBusy(true);
      setNotice("");
      try {
        const data = await apiJson("/api/assist-deck/", {
          method: "POST",
          body: JSON.stringify({
            presentation_title: presentation.title || "Презентация",
            slides: slides.map(buildRefineSlidePayload),
            instruction,
            presentation_id: presentation.id,
            mode,
          }),
        });

        if (mode === DECK_AI_MODE_APPEND_SLIDE) {
          const slide = data.slide || (Array.isArray(data.slides) ? data.slides[0] : null);
          if (!slide || typeof slide !== "object") {
            throw new Error("Модель не вернула новый слайд — создание отменено.");
          }
          const sid = slide[SLIDE_SID_KEY] || newSlideSid();
          const merged = { ...slide, [SLIDE_SID_KEY]: sid };
          const nextSlides = [...slides, merged];
          const hist = {
            ...slideHistoriesMap,
            [sid]: [
              {
                at: new Date().toISOString(),
                source: "ai",
                summary: "Новый слайд создан ИИ.",
                slide: cloneSlideSnapshot(merged),
              },
            ],
          };
          await persistDeckPatch({ slides: nextSlides, slide_histories: hist }, "Новый слайд создан и добавлен в презентацию.");
          setCurrentSlide(nextSlides.length - 1);
          return;
        }

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
        setNotice(err.message || "ИИ сейчас не смог обновить всю презентацию — можно повторить запрос позже.");
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
        throw err;
      } finally {
        setDeckAiBusy(false);
        if (mode === DECK_AI_MODE_APPEND_SLIDE) setAppendSlideBusy(false);
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
            slide: buildRefineSlidePayload(baseSlide),
            instruction,
            presentation_title: presentation.title || "Презентация",
            presentation_id: presentation.id,
          }),
        });
        const short = text.length > 88 ? `${text.slice(0, 88)}…` : text;
        await applyRefinedSlideAtIndex(slideIndex, slide, `ИИ: ${short}`, "ai");
        setLocalAiMessages((m) => [...m, { role: "assistant", text: "Готово — изменения сохранены как новая версия этого слайда." }]);
      } catch (err) {
        setLocalAiMessages((m) => [...m, { role: "assistant", text: err.message || "Запрос не прошёл — попробуйте переформулировать или повторить чуть позже." }]);
        if (err.status === 429 || err.data?.show_upsell) setUpsellOpen(true);
      } finally {
        setLocalAiBusy(false);
      }
    },
    [presentation, publicView, slides, slideHistoriesMap, historySlideSafe, applyRefinedSlideAtIndex],
  );

  const handleHistoryRestore = useCallback(
    (chronoIdx) => {
      pushUndo();
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
  const versionKeyboardChronoRef = useRef(null);

  const handleRestoreCurrentSlide = useCallback(
    (chronoIdx) => {
      clearTimeout(inlineEditTimeoutRef.current);
      if (persistBusy) return;
      pushUndo();
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

  const inlineEditUndoPushedRef = useRef(false);

  const handleInlineSlideEdit = useCallback(
    (updatedSlide) => {
      if (publicView) return;
      if (!inlineEditUndoPushedRef.current) { pushUndo(); inlineEditUndoPushedRef.current = true; }
      const sid = updatedSlide[SLIDE_SID_KEY] || slides[currentSlide]?.[SLIDE_SID_KEY];
      const merged = { ...updatedSlide, [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides];
      nextSlides[currentSlide] = merged;
      setPresentation((prev) => prev ? { ...prev, slides: nextSlides } : prev);
      clearTimeout(inlineEditTimeoutRef.current);
      inlineEditTimeoutRef.current = setTimeout(() => {
        inlineEditUndoPushedRef.current = false;
        void persistDeckPatch({ slides: nextSlides }, "");
      }, 800);
    },
    [publicView, slides, currentSlide, persistDeckPatch, pushUndo],
  );

  const flushEditedSlideVersion = useCallback(
    async (slideIdx) => {
      if (publicView) return;
      if (slideIdx < 0 || slideIdx >= slides.length) return;
      clearTimeout(inlineEditTimeoutRef.current);
      const slide = slides[slideIdx];
      const sid = slide?.[SLIDE_SID_KEY];
      if (!sid || !slide || typeof slide !== "object") return;
      const chain = slideHistoriesMap[sid] || [];
      const latest = chain[chain.length - 1]?.slide;
      const currentJson = JSON.stringify(slide);
      const latestJson = latest ? JSON.stringify(latest) : "";
      if (currentJson === latestJson) {
        await persistDeckPatch({ slides }, "");
        return;
      }
      const nextHist = {
        ...slideHistoriesMap,
        [sid]: [
          ...chain,
          {
            at: new Date().toISOString(),
            source: "user",
            summary: "Ручные правки",
            slide: cloneSlideSnapshot(slide),
          },
        ],
      };
      await persistDeckPatch({ slides, slide_histories: nextHist }, "");
    },
    [publicView, slides, slideHistoriesMap, persistDeckPatch],
  );

  const selectSlideAt = useCallback(
    async (index) => {
      if (typeof index !== "number" || Number.isNaN(index)) return;
      if (index < 0 || index >= slides.length) return;
      if (index >= unlockedSlideCount) {
        setUpsellOpen(true);
        return;
      }
      if (index !== currentSlide) {
        await flushEditedSlideVersion(currentSlide);
      }
      setCurrentSlide(index);
    },
    [slides.length, unlockedSlideCount, currentSlide, flushEditedSlideVersion],
  );

  const handleRequestAppendSlide = useCallback(() => {
    if (publicView || appendSlideBusy) return;
    setDeckAiPromptSeed({
      text: NEW_SLIDE_PROMPT_TEMPLATE,
      mode: DECK_AI_MODE_APPEND_SLIDE,
      nonce: Date.now(),
    });
  }, [publicView, appendSlideBusy]);

  /** A1: Drag-and-drop reorder. */
  const handleReorderSlides = useCallback(
    (oldIndex, newIndex) => {
      if (publicView || oldIndex === newIndex) return;
      pushUndo();
      const nextSlides = arrayMove([...slides], oldIndex, newIndex);
      const hist = { ...slideHistoriesMap };
      const nextHist = {};
      nextSlides.forEach((s) => { const sid = s?.[SLIDE_SID_KEY]; if (sid) nextHist[sid] = hist[sid] || []; });
      Object.keys(hist).forEach((k) => { if (!(k in nextHist)) nextHist[k] = hist[k]; });
      let nextCurrent = currentSlide;
      if (currentSlide === oldIndex) nextCurrent = newIndex;
      else if (oldIndex < currentSlide && newIndex >= currentSlide) nextCurrent = currentSlide - 1;
      else if (oldIndex > currentSlide && newIndex <= currentSlide) nextCurrent = currentSlide + 1;
      setCurrentSlide(Math.max(0, Math.min(nextCurrent, nextSlides.length - 1)));
      void persistDeckPatch({ slides: nextSlides, slide_histories: nextHist }, "");
    },
    [publicView, slides, slideHistoriesMap, currentSlide, persistDeckPatch, pushUndo],
  );

  /** B1: Delete slide. */
  const handleDeleteSlide = useCallback(
    (index) => {
      if (publicView || slides.length <= 1) return;
      pushUndo();
      const nextSlides = slides.filter((_, i) => i !== index);
      const hist = { ...slideHistoriesMap };
      let nextCurrent = currentSlide;
      if (index < currentSlide) nextCurrent = currentSlide - 1;
      else if (index === currentSlide) nextCurrent = Math.min(currentSlide, nextSlides.length - 1);
      setCurrentSlide(Math.max(0, nextCurrent));
      void persistDeckPatch({ slides: nextSlides, slide_histories: hist }, "");
    },
    [publicView, slides, slideHistoriesMap, currentSlide, persistDeckPatch, pushUndo],
  );

  /** B1: Duplicate slide. */
  const handleDuplicateSlide = useCallback(
    (index) => {
      if (publicView) return;
      pushUndo();
      const source = slides[index];
      if (!source) return;
      const sid = newSlideSid();
      const clone = { ...cloneSlideSnapshot(source), [SLIDE_SID_KEY]: sid };
      const nextSlides = [...slides.slice(0, index + 1), clone, ...slides.slice(index + 1)];
      const hist = { ...slideHistoriesMap };
      hist[sid] = [{ at: new Date().toISOString(), source: "user", summary: `Копия слайда ${index + 1}`, slide: cloneSlideSnapshot(clone) }];
      setCurrentSlide(index + 1);
      void persistDeckPatch({ slides: nextSlides, slide_histories: hist }, "");
    },
    [publicView, slides, slideHistoriesMap, persistDeckPatch, pushUndo],
  );

  /** B2: Undo. */
  const handleUndo = useCallback(() => {
    if (!undoStackRef.current.length || !presentation) return;
    const current = { slides: presentation.slides, slide_histories: presentation.slide_histories };
    redoStackRef.current = [...redoStackRef.current.slice(-29), current];
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    void persistDeckPatch({ slides: prev.slides, slide_histories: prev.slide_histories }, "");
  }, [presentation, persistDeckPatch]);

  /** B2: Redo. */
  const handleRedo = useCallback(() => {
    if (!redoStackRef.current.length || !presentation) return;
    const current = { slides: presentation.slides, slide_histories: presentation.slide_histories };
    undoStackRef.current = [...undoStackRef.current.slice(-29), current];
    const next = redoStackRef.current[redoStackRef.current.length - 1];
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    void persistDeckPatch({ slides: next.slides, slide_histories: next.slide_histories }, "");
  }, [presentation, persistDeckPatch]);

  const handlePromptCurrentSlideVariant = useCallback(() => {
    if (publicView || deckAiBusy) return;
    setDeckAiPromptSeed({
      text: `Работай только со слайдом ${currentSlide + 1}, остальные слайды не меняй. Вот что нужно улучшить или изменить: \n`,
      mode: DECK_AI_MODE_DECK,
      nonce: Date.now(),
    });
  }, [publicView, deckAiBusy, currentSlide]);

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
      setCurrentSlide(Math.min(nextSlides.length - 1, lastUnlockedSlideIndex));
    },
    [slides, slideHistoriesMap, historySlideSafe, persistDeckPatch, lastUnlockedSlideIndex],
  );

  useEffect(() => {
    setHistoryPreviewChrono(null);
    setHistoryCompareChrono(null);
  }, [historySlideIndex]);

  useEffect(() => {
    setLocalAiMessages([]);
  }, [historySlideIndex]);

  const moveSlide = useCallback(
    async (delta) => {
      const maxIdx = lastUnlockedSlideIndex;
      if (maxIdx < 0) return;
      let next = currentSlide + delta;
      if (next < 0) next = 0;
      else if (next > maxIdx) next = maxIdx;
      if (next !== currentSlide) {
        await flushEditedSlideVersion(currentSlide);
      }
      setCurrentSlide(next);
    },
    [lastUnlockedSlideIndex, currentSlide, flushEditedSlideVersion],
  );

  const moveVersionByKeyboard = useCallback(
    (delta) => {
      if (publicView || persistBusy) return;
      const maxIdx = currentSlideVersionsChrono.length - 1;
      if (maxIdx <= 0) return;
      const base = versionKeyboardChronoRef.current == null ? maxIdx : versionKeyboardChronoRef.current;
      const next = Math.min(maxIdx, Math.max(0, base + delta));
      if (next === base) return;
      versionKeyboardChronoRef.current = next;
      if (next !== maxIdx) {
        handleRestoreCurrentSlide(next);
      }
    },
    [publicView, persistBusy, currentSlideVersionsChrono.length, handleRestoreCurrentSlide],
  );

  useEffect(() => {
    versionKeyboardChronoRef.current = null;
  }, [currentSlide]);

  useEffect(() => {
    function onKeyDown(event) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      event.preventDefault();
      if (event.key === "ArrowUp") moveSlide(-1);
      else if (event.key === "ArrowDown") moveSlide(1);
      else if (event.key === "ArrowLeft") moveVersionByKeyboard(-1);
      else moveVersionByKeyboard(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSlide, moveVersionByKeyboard]);

  // B2: Ctrl+Z / Ctrl+Shift+Z
  useEffect(() => {
    function onUndoRedo(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        if (e.target instanceof Element && e.target.closest("input, textarea")) return;
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
      }
    }
    window.addEventListener("keydown", onUndoRedo);
    return () => window.removeEventListener("keydown", onUndoRedo);
  }, [handleUndo, handleRedo]);

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
            if (typeof parsed.fontScale === "number" && Number.isFinite(parsed.fontScale)) {
              nextFontScale = clampFontScale(parsed.fontScale);
            }
            if (typeof parsed.pageNumberMode === "string") {
              nextPageNumberMode = normalizePageNumberMode(parsed.pageNumberMode);
            } else if (typeof parsed.showPageNumbers === "boolean") {
              nextPageNumberMode = parsed.showPageNumbers ? PAGE_NUMBER_MODE_CORNER_BR : PAGE_NUMBER_MODE_NONE;
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
              "Презентацию не нашли или нет доступа. Если вы уже входили, откройте тот же адрес, что и при входе — например, localhost и 127.0.0.1 для браузера считаются разными сайтами.",
            );
          } else {
            setError(err.message || "Презентация сейчас не загрузилась — попробуйте обновить страницу.");
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
          fontScale: clampFontScale(fontScale),
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
        setNotice(data.detail || "Экспорт на вашем тарифе пока недоступен.");
        return;
      }
      if (!response.ok) {
        setNotice("Файл не получилось подготовить — попробуйте ещё раз чуть позже.");
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
      setNotice("Скачивание прервалось — проверьте сеть и попробуйте снова.");
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
      setNotice(err.message || "Публичная ссылка сейчас не включилась — попробуйте позже.");
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
      setNotice(err.message || "Название не сохранилось — попробуйте ещё раз.");
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
      <div className={`su-page editor-dark${darkMode ? " editor-actual-dark" : ""}`} style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />
        <main style={{ flex: 1, display: "flex", gap: 16, padding: "28px 20px 20px", minHeight: 0, overflow: "hidden" }}>
          <div style={{ width: 198, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-pulse" style={{ width: "100%", aspectRatio: "16/9" }} />
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="skeleton-pulse" style={{ width: "100%", aspectRatio: "16/9" }} />
          </div>
          <div style={{ width: 320, flexShrink: 0 }}>
            <div className="skeleton-pulse" style={{ width: "100%", height: "80%" }} />
          </div>
        </main>
      </div>
    );
  }

  if (error || !presentation) {
    const loadProblemMessage = sessionExpired
      ? "Сессия устарела — войдите ещё раз, и презентация откроется."
      : error || "Такой презентации у нас нет или ссылка устарела.";
    return (
      <div className="su-page editor-dark" style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
        <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />
        <main style={{ maxWidth: 1180, margin: "0 auto", padding: "48px max(24px, 5vw)", textAlign: "center" }}>
          <p className="su-user-hint" style={{ margin: "0 auto 18px", maxWidth: 520, textAlign: "center" }}>{loadProblemMessage}</p>
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
      className={`su-page editor-dark${darkMode ? " editor-actual-dark" : ""}`}
      style={{ height: "100vh", overflow: "hidden", background: "var(--bg)", color: "var(--ink)", display: "flex", flexDirection: "column" }}
    >
      <AppHeader user={user} active="library" onLibrary={() => navigate(publicView ? "/" : "/dashboard")} onLogout={() => { logout(); navigate("/"); }} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          overflow: "hidden",
        }}
      >
      <main
        className="viewer-layout"
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          padding: "18px 20px 20px",
          gap: 14,
        }}
      >
        <section style={{ minWidth: 0, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {/* ── Title row ── */}
          <div style={{ marginBottom: 12, flexShrink: 0, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minWidth: 0, gap: 10, flexWrap: "wrap" }}>
              {publicView ? (
                <h1
                  title={(presentation.title || "").trim() || "Без названия"}
                  aria-label={(presentation.title || "").trim() || "Без названия"}
                  style={{
                    margin: 0,
                    padding: 0,
                    fontFamily: "var(--font-display)",
                    fontSize: "clamp(22px, 2.65vw, 30px)",
                    lineHeight: 1.1,
                    letterSpacing: "-0.035em",
                    fontWeight: 750,
                    wordBreak: "break-word",
                    outline: "none",
                    flexShrink: 1,
                    minWidth: 0,
                  }}
                >
                  {truncatePresentationTitleDisplay(presentation.title)}
                </h1>
              ) : (
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: PRESENTATION_TITLE_RAIL_GAP_PX,
                      borderRadius: "0 8px 8px 0",
                      background: titleEditing
                        ? "color-mix(in srgb, var(--accent) 7%, transparent)"
                        : "transparent",
                      transition: "background-color 0.2s ease",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        width: PRESENTATION_TITLE_RAIL_BAR_PX,
                        flexShrink: 0,
                        alignSelf: "stretch",
                        minHeight: 26,
                        borderRadius: 2,
                        background: titleEditing ? "var(--accent)" : "transparent",
                        transition: "background-color 0.2s ease",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {titleEditing ? (
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
                      ) : (
                        <h1
                          role="button"
                          tabIndex={0}
                          title={(presentation.title || "").trim() || "Без названия"}
                          aria-label={`Редактировать название: ${(presentation.title || "").trim() || "Без названия"}`}
                          onClick={beginTitleEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); beginTitleEdit(); }
                          }}
                          style={{
                            margin: 0,
                            padding: 0,
                            fontFamily: "var(--font-display)",
                            fontSize: "clamp(22px, 2.65vw, 30px)",
                            lineHeight: 1.1,
                            letterSpacing: "-0.035em",
                            fontWeight: 750,
                            wordBreak: "break-word",
                            cursor: "pointer",
                            outline: "none",
                            flexShrink: 1,
                            minWidth: 0,
                          }}
                        >
                          {truncatePresentationTitleDisplay(presentation.title)}
                        </h1>
                      )}
                    </div>
                  </div>
                  {!titleEditing ? (
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
                </div>
              )}
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: 6,
                  flexWrap: "wrap",
                }}
              >
                {/* B2: Undo/Redo */}
                {!publicView ? (
                  <>
                    <button type="button" className="su-btn su-btn-outline" title="Отменить (Ctrl+Z)" disabled={!undoStackRef.current.length} onClick={handleUndo} style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="rotate-ccw" size={15} stroke={2} />
                    </button>
                    <button type="button" className="su-btn su-btn-outline" title="Повторить (Ctrl+Shift+Z)" disabled={!redoStackRef.current.length} onClick={handleRedo} style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon name="rotate-cw" size={15} stroke={2} />
                    </button>
                  </>
                ) : null}
                {!publicView ? (
                  <button
                    type="button"
                    className="su-btn su-btn-outline"
                    title={"Настроить стиль презентации"}
                    onClick={() => setDesignModalOpen(true)}
                    style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="palette" size={15} stroke={2} />
                    {"Стиль"}
                  </button>
                ) : null}
                {/* A4: Dark mode toggle */}
                {!publicView ? (
                  <button type="button" className="su-btn su-btn-outline" title={darkMode ? "Светлый режим" : "Тёмный режим"} onClick={() => setDarkMode((v) => !v)} style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Icon name={darkMode ? "sun" : "moon"} size={15} stroke={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="su-btn su-btn-outline"
                  title={"Демонстрация"}
                  onClick={toggleFullscreen}
                  style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Icon name="play" size={15} stroke={2} />
                  {"Демо"}
                </button>
                <div
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) setExportMenuOpen(false);
                  }}
                  style={{ position: "relative", flexShrink: 0 }}
                >
                  <button
                    type="button"
                    className="su-btn su-btn-outline"
                    title={"Скачать презентацию"}
                    aria-haspopup="menu"
                    aria-expanded={exportMenuOpen}
                    onClick={() => setExportMenuOpen((v) => !v)}
                    style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="download" size={15} stroke={2} />
                    {"Скачать"}
                    <Icon name="chevron-down" size={14} stroke={2} />
                  </button>
                  {exportMenuOpen ? (
                    <div
                      role="menu"
                      style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        zIndex: 40,
                        minWidth: 142,
                        padding: 6,
                        borderRadius: 12,
                        border: "1px solid var(--line)",
                        background: "rgba(255,255,255,.98)",
                        boxShadow: "0 12px 32px rgba(32,33,36,.14)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      {[
                        { format: "pptx", label: "PPTX", icon: "download" },
                        { format: "pdf", label: "PDF", icon: pdfExportLocked ? "lock" : "download", locked: pdfExportLocked },
                        { format: "html", label: "HTML", icon: "code" },
                      ].map((item) => (
                        <button
                          key={item.format}
                          type="button"
                          role="menuitem"
                          title={item.locked ? "PDF доступен на более высоком тарифе" : `Скачать ${item.label}`}
                          onClick={() => {
                            setExportMenuOpen(false);
                            if (item.locked) {
                              setUpsellOpen(true);
                              return;
                            }
                            download(item.format);
                          }}
                          style={{
                            width: "100%",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: "transparent",
                            color: item.locked ? "var(--ink-4)" : "var(--ink-2)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            fontSize: 12,
                            fontWeight: 650,
                            textAlign: "left",
                          }}
                        >
                          <Icon name={item.icon} size={15} stroke={2} />
                          {item.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!publicView ? (
                  <button
                    type="button"
                    className="su-btn su-btn-accent"
                    title={"Поделиться ссылкой"}
                    onClick={sharePresentation}
                    style={{ padding: "8px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Icon name="share" size={15} stroke={2} />
                    {"Поделиться"}
                  </button>
                ) : null}
              </div>
            </div>
            <div
              style={{
                marginTop: 6,
                paddingLeft: publicView ? 0 : PRESENTATION_TITLE_RAIL_SLOT_PX,
                display: "flex",
                gap: 10,
                alignItems: "center",
                color: "var(--ink-3)",
                fontSize: 12,
                flexWrap: "wrap",
              }}
            >
              <span>
                {slides.length} {slides.length === 1 ? "слайд" : slides.length >= 2 && slides.length <= 4 ? "слайда" : "слайдов"}
              </span>
              <span style={{ opacity: 0.4 }}>·</span>
              <span>{presentationStyleCaption(presentation.theme || theme)}</span>
              {/* B8: Save indicator */}
              {saveStatus !== "idle" && (
                <>
                  <span style={{ opacity: 0.4 }}>·</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: saveStatus === "error" ? "#b91c1c" : saveStatus === "saved" ? "#16a34a" : "var(--accent)" }}>
                    <Icon name={saveStatus === "saving" ? "loader" : saveStatus === "saved" ? "check" : "alert-triangle"} size={12} stroke={2} style={saveStatus === "saving" ? { animation: "pulse 1s linear infinite" } : undefined} />
                    {saveStatus === "saving" ? "Сохраняю..." : saveStatus === "saved" ? "Сохранено" : "Ошибка"}
                  </span>
                </>
              )}
            </div>
          </div>

          {notice ? (
            <div
              style={{
                marginBottom: 14,
                flexShrink: 0,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,.74)",
                color: "var(--ink-2)",
                fontSize: 13,
                lineHeight: 1.45,
                backdropFilter: "blur(10px)",
              }}
            >
              {notice}{shareUrl ? `: ${shareUrl}` : ""}
            </div>
          ) : null}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "row",
              alignItems: "stretch",
              gap: 16,
            }}
          >
          {/* ── Slide canvas card ── */}
          <SlideFilmstripSidebar
            slides={slides}
            currentSlide={currentSlide}
            onSlideSelect={selectSlideAt}
            unlockedSlideCount={unlockedSlideCount}
            preset={basePreset}
            accent={basePreset.accent}
            fontScale={fontScale}
            pageNumberMode={pageNumberMode}
            watermarkMode={watermarkMode}
            slideWidth={slideDims?.w}
            slideHeight={slideDims?.h}
            appendSlideBusy={appendSlideBusy}
            onAppendSlidePrompt={handleRequestAppendSlide}
            moveSlide={moveSlide}
            leadingInsetPx={publicView ? 8 : PRESENTATION_TITLE_RAIL_SLOT_PX}
            onReorder={!publicView ? handleReorderSlides : null}
            onDeleteSlide={!publicView ? handleDeleteSlide : null}
            onDuplicateSlide={!publicView ? handleDuplicateSlide : null}
            slideMenuIndex={slideMenuIndex}
            onSlideMenuChange={setSlideMenuIndex}
          />
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              minHeight: 0,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
              background: "transparent",
              border: "none",
              borderRadius: 0,
              padding: 0,
              boxShadow: "none",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, width: "100%", alignItems: "stretch" }}>
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 0,
                }}
              >
                <div
                  ref={setSlideAreaEl}
                  className="slide-canvas-transition"
                  style={{
                    flex: 1,
                    minHeight: 0,
                    minWidth: 0,
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                  }}
                >
                  {slideDims && (
                    <SlideCanvas
                      key={currentSlide}
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
                <SlideVersionsColumn
                  variant="below"
                  versionsChrono={currentSlideVersionsChrono}
                  slideIndex={currentSlide}
                  slidesLen={slides.length}
                  preset={basePreset}
                  onActivate={handleRestoreCurrentSlide}
                  onPromptAi={handlePromptCurrentSlideVariant}
                  localAiBusy={localAiBusy}
                  busy={persistBusy}
                  publicView={publicView}
                />
              </div>
            </div>
          </div>
          {!publicView && !isMobile ? (
            <aside
              aria-label="Работа с ИИ"
              style={{
                width: "min(380px, 28vw)",
                minWidth: 320,
                maxWidth: 420,
                flexShrink: 0,
                minHeight: 0,
                alignSelf: "stretch",
                display: "flex",
                flexDirection: "column",
                padding: 0,
                boxSizing: "border-box",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <DeckAiComposer
                  presentationTitle={presentation?.title || ""}
                  presentationId={id}
                  publicView={publicView}
                  busy={deckAiBusy}
                  promptSeed={deckAiPromptSeed}
                  onBusyChange={setDeckAiBusy}
                  onApplyDeckAssist={handleApplyDeckAssist}
                  onAuthRequest={() => setAuthOpen(true)}
                />
              </div>
            </aside>
          ) : null}

          </div>
        </section>
      </main>
      </div>

      {/* A6: Mobile AI floating button + overlay */}
      {!publicView && isMobile && !mobileAiOpen ? (
        <button
          type="button"
          aria-label="Открыть ИИ-ассистент"
          onClick={() => setMobileAiOpen(true)}
          style={{
            position: "fixed", bottom: 20, right: 20, zIndex: 70,
            width: 52, height: 52, borderRadius: 999,
            background: "var(--accent)", color: "var(--accent-fg)",
            display: "grid", placeItems: "center",
            boxShadow: "0 4px 16px rgba(0,0,0,.22)",
            border: "none", cursor: "pointer",
          }}
        >
          <Icon name="sparkles" size={22} stroke={2} />
        </button>
      ) : null}
      {!publicView && isMobile && mobileAiOpen ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>ИИ-ассистент</span>
            <button type="button" onClick={() => setMobileAiOpen(false)} style={{ width: 34, height: 34, borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
              <Icon name="x" size={17} stroke={2} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
            <DeckAiComposer
              presentationTitle={presentation?.title || ""}
              presentationId={id}
              publicView={publicView}
              busy={deckAiBusy}
              promptSeed={deckAiPromptSeed}
              onBusyChange={setDeckAiBusy}
              onApplyDeckAssist={handleApplyDeckAssist}
              onAuthRequest={() => setAuthOpen(true)}
            />
          </div>
        </div>
      ) : null}

      {/* B9: Floating format toolbar */}
      <FloatingFormatToolbar accent={basePreset.accent} />

      {designModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={"Настройки стиля"}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDesignModalOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 80,
            display: "grid",
            placeItems: "center",
            padding: 24,
            background: "rgba(32,33,36,.18)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div
            style={{
              width: "min(720px, calc(100vw - 48px))",
              maxHeight: "min(760px, calc(100vh - 48px))",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderRadius: 16,
              border: "1px solid var(--line)",
              background: "rgba(255,255,255,.96)",
              boxShadow: "0 18px 54px rgba(32,33,36,.18)",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <h2 style={{ flex: 1, margin: 0, fontSize: 15, fontWeight: 750, lineHeight: 1.2 }}>
                {"Стиль презентации"}
              </h2>
              {appearanceHasOverrides ? (
                <button
                  type="button"
                  onClick={resetAppearanceToTheme}
                  className="su-btn su-btn-outline"
                  style={{ padding: "7px 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  <Icon name="rotate-ccw" size={14} stroke={2} />
                  {"Сбросить"}
                </button>
              ) : null}
              <button
                type="button"
                aria-label={"Закрыть"}
                onClick={() => setDesignModalOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid var(--line)",
                  background: "rgba(255,255,255,.88)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--ink-3)",
                  flexShrink: 0,
                }}
              >
                <Icon name="x" size={17} stroke={2} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 18px 20px" }}>
              <EditorDesignPanel
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
                onLockedPreset={() => setUpsellOpen(true)}
                publicView={publicView}
                fontScale={fontScale}
                onFontScaleChange={(v) => setFontScale(clampFontScale(v))}
                pageNumberMode={pageNumberMode}
                onPageNumberModeChange={setPageNumberMode}
                watermarkMode={watermarkMode}
                onWatermarkModeChange={setWatermarkMode}
                onReset={resetAppearanceToTheme}
                hasOverrides={appearanceHasOverrides}
              />
            </div>
          </div>
        </div>
      ) : null}

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

const EDITOR_DOCK_WIDTH = 84;
const EDITOR_PANEL_WIDTH = 360;

function SidebarPanelHeader({ title, onClose, extra }) {
  return (
    <div
      style={{
        width: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderBottom: "1px solid var(--line)",
        background: "rgba(255,255,255,.82)",
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
          borderRadius: 999,
          border: "1px solid var(--line)",
          background: "rgba(255,255,255,.88)",
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
          {Math.round(clampFontScale(fontScale) * 100)}%
        </span>
      </div>
      <input
        type="range"
        min={70}
        max={130}
        step={1}
        value={Math.round(clampFontScale(fontScale) * 100)}
        onChange={(e) => onFontScaleChange(clampFontScale(Number(e.target.value) / 100))}
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

const DECK_AI_PROMPTS = [
  {
    id: "fix-current",
    label: "Исправь на этом слайде ...",
    prompt: "Исправь текущий слайд: . Не меняй смысл презентации, улучши ясность, структуру и визуальную иерархию.",
  },
  {
    id: "new-structure",
    label: "Придумай новую структуру",
    prompt: "Придумай новую структуру презентации: выстрой слайды логично, убери повторы, усили переходы между идеями и сохрани ключевой смысл.",
  },
  {
    id: "rewrite",
    label: "Переформулируй",
    prompt: "Переформулируй текст презентации: сделай формулировки яснее, короче и увереннее, сохрани факты, тон и основную мысль.",
  },
  {
    id: "redo",
    label: "Просто переделай",
    prompt: "Переделай презентацию целиком лучше: усили структуру, сократи слабые места, сделай заголовки точнее, а слайды более убедительными.",
  },
];

function DeckAiComposer({ presentationTitle: _presentationTitle, presentationId: _presentationId, publicView, busy, promptSeed, onBusyChange, onApplyDeckAssist, onAuthRequest }) {
  const [prompt, setPrompt] = useState("");
  const [promptMode, setPromptMode] = useState(DECK_AI_MODE_DECK);
  const [docFile, setDocFile] = useState(null);
  const [speechListening, setSpeechListening] = useState(false);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const speechBaseRef = useRef("");
  const promptHistoryRef = useRef({ entries: [""], index: 0 });

  const speechSupported =
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function toggleSpeechInput() {
    if (speechListening) {
      recognitionRef.current?.stop();
      return;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = 0; i < event.results.length; i++) {
        if (i > 0) chunk += " ";
        chunk += event.results[i][0].transcript;
      }
      const spoken = chunk.trim();
      const base = speechBaseRef.current.trimEnd();
      const glue = base && spoken ? " " : "";
      setPrompt(base + glue + spoken);
    };
    recognition.onerror = () => {
      if (recognitionRef.current === recognition) setSpeechListening(false);
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) setSpeechListening(false);
    };
    recognitionRef.current = recognition;
    speechBaseRef.current = prompt;
    try {
      recognition.start();
      setSpeechListening(true);
    } catch {
      setSpeechListening(false);
    }
  }

  const pushPromptHistory = useCallback((nextValue) => {
    const next = String(nextValue ?? "");
    const h = promptHistoryRef.current;
    const current = h.entries[h.index];
    if (current === next) return;
    const trimmedEntries = h.entries.slice(0, h.index + 1);
    trimmedEntries.push(next);
    const maxEntries = 200;
    const kept = trimmedEntries.length > maxEntries ? trimmedEntries.slice(trimmedEntries.length - maxEntries) : trimmedEntries;
    h.entries = kept;
    h.index = kept.length - 1;
  }, []);

  function applyPromptTemplate(template, mode = DECK_AI_MODE_DECK) {
    setPrompt(template);
    pushPromptHistory(template);
    setPromptMode(mode);
    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(template.length, template.length);
    });
  }

  useEffect(() => {
    if (!promptSeed?.nonce) return;
    applyPromptTemplate(promptSeed.text || NEW_SLIDE_PROMPT_TEMPLATE, promptSeed.mode || DECK_AI_MODE_DECK);
  }, [promptSeed?.nonce]);

  async function submitPrompt() {
    const trimmed = prompt.trim();
    if (!trimmed || publicView) return;
    if (!getAccessToken()) {
      onAuthRequest();
      return;
    }

    onBusyChange(true);
    try {
      await onApplyDeckAssist(trimmed, { mode: promptMode });
      setPrompt("");
      pushPromptHistory("");
      setPromptMode(DECK_AI_MODE_DECK);
    } finally {
      onBusyChange(false);
    }
  }

  return (
    <div
      className="hero-composer"
      style={{
        margin: 0,
        width: "100%",
        maxWidth: "none",
        padding: 12,
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        boxShadow: "0 1px 2px rgba(32,33,36,.04), 0 8px 22px rgba(32,33,36,.06)",
      }}
    >
      <div style={{ padding: "2px 2px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <Icon name="sparkles" size={16} stroke={2} style={{ color: "var(--accent)" }} />
          <div style={{ fontSize: 14, fontWeight: 750, color: "var(--ink)", letterSpacing: "-0.015em" }}>
            Работа с ИИ
          </div>
        </div>
        <div style={{ fontSize: 12, lineHeight: 1.35, color: "var(--ink-3)" }}>
          Напишите, что поменять в презентации, или выберите быстрый сценарий.
        </div>
      </div>

      <div
        style={{
          marginTop: "auto",
          flexShrink: 0,
          borderTop: "1px solid color-mix(in srgb, var(--line) 78%, transparent)",
          padding: "10px 0 0",
          border: "none",
          borderRadius: 0,
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 6,
            overflow: "hidden",
          }}
        >
          {DECK_AI_PROMPTS.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy}
              onClick={() => applyPromptTemplate(item.prompt, item.mode || DECK_AI_MODE_DECK)}
              style={{
                padding: "6px 9px",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--line)",
                background: "rgba(255,255,255,.72)",
                fontSize: 11.5,
                lineHeight: 1.2,
                color: "var(--ink-2)",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.55 : 1,
                flex: "1 1 calc(50% - 6px)",
                minWidth: 0,
                textAlign: "center",
                whiteSpace: "normal",
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={(event) => {
            const next = event.target.value;
            setPrompt(next);
            pushPromptHistory(next);
            if (!next.trim()) setPromptMode(DECK_AI_MODE_DECK);
          }}
          onKeyDown={(event) => {
            const isMod = event.metaKey || event.ctrlKey;
            if (isMod && !event.altKey && event.key.toLowerCase() === "z" && !event.shiftKey) {
              const h = promptHistoryRef.current;
              if (h.index > 0) {
                event.preventDefault();
                h.index -= 1;
                const prev = h.entries[h.index] ?? "";
                setPrompt(prev);
                if (!prev.trim()) setPromptMode(DECK_AI_MODE_DECK);
              }
              return;
            }
            if (
              isMod &&
              !event.altKey &&
              (event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey))
            ) {
              const h = promptHistoryRef.current;
              if (h.index < h.entries.length - 1) {
                event.preventDefault();
                h.index += 1;
                const next = h.entries[h.index] ?? "";
                setPrompt(next);
                if (!next.trim()) setPromptMode(DECK_AI_MODE_DECK);
              }
              return;
            }
            if (event.key === "Enter" && !event.shiftKey && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submitPrompt();
            }
          }}
          placeholder="Напишите, что изменить в презентации..."
          className="hero-textarea"
          rows={7}
          disabled={busy}
          style={{
            minHeight: 168,
            padding: "12px 14px",
            borderLeft: "none",
            borderRadius: 0,
            background: "color-mix(in srgb, var(--surface-2) 28%, var(--surface))",
            fontSize: 14,
            lineHeight: 1.45,
          }}
        />

        {docFile ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--accent-soft)", borderRadius: "var(--r-md)", fontSize: 12 }}>
            <Icon name="paperclip" size={13} style={{ color: "var(--accent)" }} />
            <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{docFile.name}</span>
            <button type="button" onClick={() => setDocFile(null)} style={{ color: "var(--ink-3)" }} aria-label="Убрать файл">
              <Icon name="x" size={12} />
            </button>
          </div>
        ) : null}

        <div className="hero-controls" style={{ padding: "2px 0 0", gap: 10 }}>
          <div className="hero-controls-start">
            {busy ? (
              <span aria-label="ИИ применяет изменения" style={{ display: "inline-flex", alignItems: "center", gap: 4, paddingInline: 6 }}>
                <span className="su-ai-typing-dot" />
                <span className="su-ai-typing-dot" />
                <span className="su-ai-typing-dot" />
              </span>
            ) : null}
            {speechSupported ? (
              <button
                type="button"
                className="hero-mic-btn hero-icon-tooltip"
                data-active={speechListening}
                aria-label={speechListening ? "Остановить голосовой ввод" : "Голосовой ввод"}
                aria-pressed={speechListening}
                onClick={toggleSpeechInput}
                disabled={busy}
              >
                <Icon name="mic" size={18} stroke={2} />
                <span className="hero-icon-tooltip__bubble" role="tooltip">
                  {speechListening ? "Стоп" : "Голос в текст"}
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className="hero-attach-btn hero-icon-tooltip"
              aria-label="Вложить файл"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <Icon name="paperclip" size={18} stroke={2} />
              <span className="hero-icon-tooltip__bubble" role="tooltip">
                PDF, Word, PPTX, фото
              </span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={HERO_SOURCE_ACCEPT}
              style={{ display: "none" }}
              onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <button
            type="button"
            className="su-btn su-btn-accent"
            disabled={busy || !prompt.trim()}
            onClick={() => void submitPrompt()}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13,
            }}
          >
            {busy ? "Применяем..." : "Отправить"}
            <Icon name="arrow-right" size={15} stroke={2} />
          </button>
        </div>
      </div>
    </div>
  );
}

const AI_QUICK_ACTIONS = [
  { id: "structure", label: "Логика и структура", prompt: "Улучши структуру и логику всей презентации" },
  { id: "style", label: "Единый тон", prompt: "Приведи формулировки к единому уверенному тону на всех слайдах" },
  { id: "shorten", label: "Короче текст", prompt: "Сократи текст на всех слайдах, сохранив смысл" },
  { id: "hierarchy", label: "Короче заголовки", prompt: "Сделай заголовки короче и заметнее" },
  { id: "logic", label: "Без повторов", prompt: "Убери повторы между слайдами" },
];

function EditorAiPanel({ presentationTitle: _presentationTitle, presentationId: _presentationId, publicView, busy, onBusyChange, onApplyDeckAssist, onAuthRequest }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      text: "Напишите, что поменять во всей презентации — или выберите подсказку ниже.",
    },
  ]);

  async function runInstruction(apiText, displayText = null) {
    if (publicView) return;
    const trimmed = apiText.trim();
    if (!trimmed) return;
    const shown = (displayText ?? apiText).trim() || trimmed;
    if (!getAccessToken()) {
      onAuthRequest();
      return;
    }
    setMessages((m) => [...m, { role: "user", text: shown }]);
    onBusyChange(true);
    try {
      await onApplyDeckAssist(trimmed);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Готово — проверьте слайды на холсте.",
        },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: err.message || "Сейчас не получилось ответить — загляните чуть позже или попробуйте короче." }]);
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        boxSizing: "border-box",
        gap: 12,
      }}
    >
      <div style={{ flexShrink: 0, fontSize: 12, lineHeight: 1.45, color: "var(--ink-3)" }}>
        Напишите, что поменять во всей презентации, или выберите быструю подсказку.
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0, minWidth: 0, width: "100%" }}>
        {AI_QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => void runInstruction(a.prompt, a.label)}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid var(--line-2)",
              background: "var(--surface)",
              fontSize: 12,
              color: "var(--ink-2)",
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.55 : 1,
              maxWidth: "100%",
              whiteSpace: "normal",
              overflowWrap: "anywhere",
            }}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflowY: "auto",
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "color-mix(in srgb, var(--surface-2) 30%, var(--surface))",
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((msg, i) => (
          <div
            key={`${msg.role}-${i}`}
            style={{
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              maxWidth: "min(100%, 320px)",
              minWidth: 0,
              padding: "10px 12px",
              borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
              fontSize: 13,
              lineHeight: 1.45,
              background: msg.role === "user" ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "var(--surface)",
              border:
                msg.role === "user"
                  ? "1px solid color-mix(in srgb, var(--accent) 25%, transparent)"
                  : "1px solid var(--line)",
              color: "var(--ink)",
            }}
          >
            {msg.text}
          </div>
        ))}
        {busy ? (
          <div
            style={{
              alignSelf: "flex-start",
              fontSize: 12,
              color: "var(--ink-3)",
              padding: "4px 0",
            }}
          >
            …
          </div>
        ) : null}
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          minWidth: 0,
          width: "100%",
          boxSizing: "border-box",
          padding: 10,
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "rgba(255,255,255,.82)",
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Сообщение..."
          rows={2}
          disabled={busy}
          style={{
            width: "100%",
            boxSizing: "border-box",
            resize: "none",
            minHeight: 44,
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--line)",
            fontSize: 13,
            fontFamily: "inherit",
            color: "var(--ink)",
            background: "var(--surface)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              submitPrompt();
            }
          }}
        />
        <button
          type="button"
          className="su-btn su-btn-accent"
          style={{ width: "100%", fontSize: 13 }}
          disabled={busy || !prompt.trim()}
          onClick={submitPrompt}
        >
          {busy ? "Отправка..." : "Отправить"}
        </button>
      </div>
    </div>
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
  onAuthRequest,
  slidesLength,
  lastUnlockedSlideIndex,
  panelWidth,
}) {
  const dock = [
    { id: "design", title: "Дизайн презентации", icon: "palette" },
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
          borderRadius: 999,
          border: "1px solid color-mix(in srgb, var(--accent) 20%, var(--line))",
          background: "rgba(255,255,255,.78)",
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

  const panelBusy = persistBusy || localAiBusy;

  return (
    <>
      <div
        className="editor-right-sidebar"
        style={{
          alignSelf: "stretch",
          height: "100%",
          minHeight: 0,
          minWidth: 0,
          flexShrink: 0,
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
          zIndex: 3,
          borderRadius: 16,
          overflow: "hidden",
          background: "transparent",
          boxShadow: activePanel
            ? "0 1px 2px rgba(32,33,36,.04), 0 10px 28px rgba(32,33,36,.07)"
            : "0 1px 2px rgba(32,33,36,.04), 0 6px 18px rgba(32,33,36,.05)",
          transition: "box-shadow 0.22s ease",
        }}
      >
        <div
          aria-hidden={!activePanel}
          style={{
            width: activePanel ? panelWidth : 0,
            flexShrink: 0,
            minWidth: 0,
            boxSizing: "border-box",
            border: activePanel ? "1px solid var(--line)" : "0 solid transparent",
            borderRight: "none",
            borderRadius: "16px 0 0 16px",
            boxShadow: "0 1px 2px rgba(32,33,36,.04), 0 10px 28px rgba(32,33,36,.07)",
            backdropFilter: "blur(12px)",
            overflow: "hidden",
            opacity: activePanel ? 1 : 0,
            pointerEvents: activePanel ? "auto" : "none",
            transition: "width 0.22s ease, opacity 0.12s ease",
          }}
        >
          <div
            style={{
              width: panelWidth,
              height: "100%",
              minHeight: 0,
              boxSizing: "border-box",
              background: "rgba(255,255,255,.9)",
              display: "flex",
              flexDirection: "column",
            }}
          >
          {activePanel ? (
            <>
              <SidebarPanelHeader
                title={titles[activePanel] || ""}
                onClose={() => onActivePanelChange(null)}
                extra={activePanel === "design" ? resetChip : null}
              />
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  minWidth: 0,
                  width: "100%",
                  boxSizing: "border-box",
                  overflowY: activePanel === "ai" ? "hidden" : "auto",
                  overflowX: "hidden",
                  padding: "16px 18px 20px",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
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
                  <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <EditorAiPanel
                      presentationTitle={presentationTitle}
                      presentationId={presentationId}
                      publicView={publicView}
                      busy={deckAiBusy}
                      onBusyChange={onDeckAiBusyChange}
                      onApplyDeckAssist={onDeckAssist}
                      onAuthRequest={onAuthRequest}
                    />
                  </div>
                ) : null}
                {activePanel === "history" ? (
                  <SlideHistoryTab
                    slideIndex={historySlideIndex}
                    slidesLen={slidesLength}
                    lastUnlockedSlideIndex={lastUnlockedSlideIndex}
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
            </>
          ) : null}
          </div>
        </div>
      <div
        style={{
          width: EDITOR_DOCK_WIDTH,
          minHeight: 0,
          alignSelf: "stretch",
          flexShrink: 0,
          border: "1px solid var(--line)",
          borderRadius: activePanel ? "0 16px 16px 0" : 16,
          boxShadow: activePanel
            ? "0 1px 2px rgba(32,33,36,.04), 0 10px 28px rgba(32,33,36,.07)"
            : "0 1px 2px rgba(32,33,36,.04), 0 6px 18px rgba(32,33,36,.05)",
          background: "rgba(255,255,255,.8)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 10,
          boxSizing: "border-box",
          padding: "14px 8px",
          backdropFilter: "blur(12px)",
          overflow: "hidden",
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
                width: "100%",
                minHeight: 62,
                borderRadius: 12,
                border: on ? "1px solid color-mix(in srgb, var(--accent) 35%, var(--line))" : "1px solid transparent",
                background: on ? "color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.98))" : "rgba(255,255,255,.6)",
                boxShadow: on ? "0 0 0 3px color-mix(in srgb, var(--accent) 10%, transparent)" : "none",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 5,
                color: on ? "var(--accent)" : "var(--ink-2)",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease, color 0.18s ease, background 0.18s ease",
                padding: "8px 6px",
              }}
            >
              <Icon name={item.icon} size={24} stroke={on ? 2.1 : 1.85} />
              <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.1 }}>
                {item.id === "design" ? "Стиль" : item.id === "ai" ? "ИИ" : "Экспорт"}
              </span>
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
      if (ref.current.innerHTML !== str) ref.current.innerHTML = str;
    }
  });

  if (!onChange) return <Tag style={style} {...rest} dangerouslySetInnerHTML={{ __html: String(value ?? "") }} />;

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
        const newVal = e.currentTarget.innerHTML;
        if (newVal !== String(value ?? "")) onChange(newVal);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.innerHTML = String(value ?? "");
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
  /** Внутренние поля контента слайда (% ширины). */
  const slidePadPct = 6.5;
  /** Доп. отступ счётчика/знака от правого края — ближе к колонке заголовка. */
  const pageCounterCornerExtraPct = 4;
  const pageCounterRightPct = slidePadPct + pageCounterCornerExtraPct;

  const isHtml = isHtmlSlide(slide);
  const slideMetaIcon = typeof slide?.metadata?.icon === "string" ? slide.metadata.icon.trim() : "";
  const icon = isHtml ? slideMetaIcon : (typeof slide?.icon === "string" ? slide.icon.trim() : "");
  const chartFromMeta = isHtml ? slide?.metadata?.chart : slide?.chart;
  const chart = chartFromMeta && Array.isArray(chartFromMeta.data) && chartFromMeta.data.length >= 2 ? chartFromMeta : null;
  const slideImageSrc = !isHtml && slide?.image === true && assets?.images?.[0]
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
        padding: `${slidePadPct}%`,
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
            marginRight: `${pageCounterCornerExtraPct}%`,
          }}
        >
          {showWmTR ? <div style={watermarkLabelStyle}>SlideUp</div> : null}
          {showCornerTR ? <div style={pageCounterStyle}>{pageCounterText}</div> : null}
        </div>
      </div>

      {isHtml ? (
        <div
          className="slide-html-canvas"
          style={{ flex: 1, minHeight: 0, color: preset.ink, "--accent": preset.accent, fontSize: sp(1.6, 14, 22) }}
          dangerouslySetInnerHTML={{ __html: getSafeSlideHtml(slide, { assets }) }}
        />
      ) : (
      <>
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
          {/* B6: Inline-edit content (string, non-empty, no bullets) */}
          {typeof slide?.content === "string" && slide.content && !bullets.length && (
            <EditableField
              tag="p"
              style={{
                fontSize: sp(1.6, 14, 22),
                lineHeight: 1.5,
                margin: "3% 0 0",
                maxWidth: hasRightPanel ? "100%" : "68%",
                opacity: 0.85,
              }}
              value={slide.content}
              onChange={onSlideChange ? (v) => onSlideChange({ ...slide, content: v }) : null}
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
                  <EditableField
                    tag="span"
                    style={{
                      color: preset.accent,
                      fontFamily: "var(--font-mono)",
                      fontSize: "0.68em",
                      fontWeight: 700,
                      minWidth: Math.round(24 * layoutUnit),
                      display: "inline-block",
                    }}
                    value={getSlideBulletMarker(slide, bulletIndex)}
                    onChange={onSlideChange ? (v) => {
                      const nextMarkers = bullets.map((_, i) =>
                        i === bulletIndex ? String(v ?? "") : getSlideBulletMarker(slide, i)
                      );
                      onSlideChange({ ...slide, bulletMarkers: nextMarkers });
                    } : null}
                  />
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
      {/* B6: two_column layout */}
      {!isHtml && slide?.type === "two_column" && slide?.content && typeof slide.content === "object" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4%", marginTop: "2%" }}>
          {["left", "right"].map((side) => {
            const col = slide.content[side];
            if (!col) return null;
            return (
              <div key={side} style={{ minWidth: 0 }}>
                {col.heading && (
                  <EditableField
                    tag="h3"
                    style={{ fontSize: sp(2, 14, 24), fontWeight: 700, margin: "0 0 3%", fontFamily: "var(--font-display)" }}
                    value={col.heading}
                    onChange={onSlideChange ? (v) => onSlideChange({ ...slide, content: { ...slide.content, [side]: { ...col, heading: v } } }) : null}
                  />
                )}
                {Array.isArray(col.bullets) && col.bullets.length > 0 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: sp(0.8, 6, 12) }}>
                    {col.bullets.map((b, bi) => (
                      <li key={bi} style={{ fontSize: sp(1.4, 12, 20), lineHeight: 1.4 }}>
                        <EditableField
                          tag="span"
                          value={String(b)}
                          onChange={onSlideChange ? (v) => {
                            const nb = col.bullets.map((x, xi) => xi === bi ? v : x);
                            onSlideChange({ ...slide, content: { ...slide.content, [side]: { ...col, bullets: nb } } });
                          } : null}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}
      {showCornerBR || showWmBR ? (
        <div
          style={{
            position: "absolute",
            right: `${pageCounterRightPct}%`,
            bottom: `${slidePadPct}%`,
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

function SlideThumbnail({
  slide,
  index,
  total,
  preset,
  fontScale = 1,
  pageNumberMode = DEFAULT_PAGE_NUMBER_MODE,
  watermarkMode = DEFAULT_WATERMARK_MODE,
  slideWidth = null,
  slideHeight = null,
  cornerRadius = 8,
}) {
  return (
    <DeckSlideThumbCanvas
      slide={slide}
      index={index}
      total={total}
      preset={preset}
      fontScale={fontScale}
      pageNumberMode={pageNumberMode}
      watermarkMode={watermarkMode}
      slideWidth={slideWidth}
      slideHeight={slideHeight}
      cornerRadius={cornerRadius}
    />
  );
}

const SLIDE_FILMSTRIP_WIDTH = 198;
const SLIDE_FILMSTRIP_THUMB_RADIUS = 8;

/** A1: Sortable slide item for the filmstrip. */
function SortableSlideItem({ id, slide, index, slidesLen, active: isActive, locked, accent, preset, fontScale, pageNumberMode, watermarkMode, slideWidth, slideHeight, onSlideSelect, onDeleteSlide, onDuplicateSlide, slideMenuIndex, onSlideMenuChange, rowRef }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const combinedRef = useCallback((node) => {
    setNodeRef(node);
    if (rowRef) rowRef.current = node;
  }, [setNodeRef, rowRef]);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    position: "relative",
  };
  const menuOpen = slideMenuIndex === index;
  return (
    <div ref={combinedRef} style={style}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, paddingTop: 5 }}>
        <span {...attributes} {...listeners} style={{ cursor: "grab", color: "var(--ink-3)", display: "flex", alignItems: "center", opacity: 0.7, padding: "2px 0" }} title="Перетащить">
          <Icon name="grip-vertical" size={14} stroke={2.2} />
        </span>
        <span style={{ width: 22, flexShrink: 0, textAlign: "right", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600, color: isActive ? accent : "var(--ink-4)", lineHeight: 1 }}>
          {index + 1}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onSlideSelect(index)}
        aria-disabled={locked}
        title={locked ? "Слайд откроется после пополнения лимита слайдов" : getSlideTitle(slide, index)}
        style={{
          flex: 1, minWidth: 0, margin: 0, padding: 4,
          borderRadius: SLIDE_FILMSTRIP_THUMB_RADIUS + 2,
          border: isDragging ? "2px solid var(--accent)" : "none",
          background: isActive ? `color-mix(in srgb, ${accent} 14%, transparent)` : "transparent",
          cursor: locked ? "not-allowed" : "pointer", outline: "none", textAlign: "left",
          transition: "background 0.15s, opacity 0.15s",
          boxShadow: "none", opacity: locked ? 0.72 : 1, position: "relative",
        }}
      >
        <div style={{ position: "relative", borderRadius: SLIDE_FILMSTRIP_THUMB_RADIUS, overflow: "hidden" }}>
          <SlideThumbnail slide={slide} index={index} total={slidesLen} preset={preset} fontScale={fontScale} pageNumberMode={pageNumberMode} watermarkMode={watermarkMode} slideWidth={slideWidth} slideHeight={slideHeight} cornerRadius={SLIDE_FILMSTRIP_THUMB_RADIUS} />
          {locked ? (
            <div aria-hidden style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--ink) 38%, transparent)", pointerEvents: "none" }}>
              <Icon name="lock" size={28} stroke={2} style={{ color: "rgba(255,255,255,.92)" }} />
            </div>
          ) : null}
        </div>
        {/* B1: More menu */}
        {!locked && onDeleteSlide && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSlideMenuChange(menuOpen ? null : index); }}
            className={`filmstrip-more-btn${menuOpen ? " filmstrip-more-btn--open" : ""}`}
            style={{
              position: "absolute", top: 2, right: 2, width: 22, height: 22,
              borderRadius: 6, background: "rgba(255,255,255,.85)", border: "1px solid var(--line)",
              display: "grid", placeItems: "center", color: "var(--ink-3)",
              cursor: "pointer",
              zIndex: 5,
            }}
          >
            <Icon name="more-vertical" size={13} stroke={2} />
          </button>
        )}
        {menuOpen && (
          <div
            style={{
              position: "absolute", top: 26, right: 0, zIndex: 50, minWidth: 130,
              padding: 4, borderRadius: 10, border: "1px solid var(--line)",
              background: "var(--surface)", boxShadow: "0 6px 18px rgba(0,0,0,.12)",
              display: "flex", flexDirection: "column", gap: 2,
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={(e) => { e.stopPropagation(); onSlideMenuChange(null); onDuplicateSlide?.(index); }} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, background: "transparent", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", textAlign: "left", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <Icon name="copy" size={13} stroke={2} /> Дублировать
            </button>
            {slidesLen > 1 && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onSlideMenuChange(null); onDeleteSlide?.(index); }} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, background: "transparent", fontSize: 12, fontWeight: 600, color: "#b91c1c", textAlign: "left", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <Icon name="trash-2" size={13} stroke={2} /> Удалить
              </button>
            )}
          </div>
        )}
      </button>
    </div>
  );
}

function SlideFilmstripSidebar({
  slides,
  currentSlide,
  onSlideSelect,
  unlockedSlideCount,
  preset,
  accent,
  fontScale = 1,
  pageNumberMode = DEFAULT_PAGE_NUMBER_MODE,
  watermarkMode = DEFAULT_WATERMARK_MODE,
  slideWidth = null,
  slideHeight = null,
  appendSlideBusy = false,
  onAppendSlidePrompt = null,
  moveSlide,
  leadingInsetPx = 8,
  onReorder = null,
  onDeleteSlide = null,
  onDuplicateSlide = null,
  slideMenuIndex = null,
  onSlideMenuChange = null,
}) {
  const activeRowRef = useRef(null);

  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentSlide]);

  const navDisabled = unlockedSlideCount <= 1;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const slideIds = useMemo(() => slides.map((s, i) => s?.[SLIDE_SID_KEY] ?? `filmstrip-slide-${i}`), [slides]);

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    const oldIndex = slideIds.indexOf(String(active.id));
    const newIndex = slideIds.indexOf(String(over.id));
    if (oldIndex >= 0 && newIndex >= 0) onReorder?.(oldIndex, newIndex);
  }

  const filmstripContent = (
    <>
      {slides.map((slide, index) => {
        const active = currentSlide === index;
        const locked = index >= unlockedSlideCount;
        return (
          <SortableSlideItem
            key={slideIds[index]}
            id={slideIds[index]}
            slide={slide}
            index={index}
            slidesLen={slides.length}
            active={active}
            locked={locked}
            accent={accent}
            preset={preset}
            fontScale={fontScale}
            pageNumberMode={pageNumberMode}
            watermarkMode={watermarkMode}
            slideWidth={slideWidth}
            slideHeight={slideHeight}
            onSlideSelect={onSlideSelect}
            onDeleteSlide={onDeleteSlide}
            onDuplicateSlide={onDuplicateSlide}
            slideMenuIndex={slideMenuIndex}
            onSlideMenuChange={onSlideMenuChange}
            rowRef={active ? activeRowRef : null}
          />
        );
      })}
    </>
  );

  return (
    <div
      className="filmstrip-sidebar"
      style={{
        width: SLIDE_FILMSTRIP_WIDTH,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        alignSelf: "stretch",
        borderRight: "1px solid color-mix(in srgb, var(--line) 42%, transparent)",
        background: "transparent",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          paddingTop: 10,
          paddingRight: 8,
          paddingBottom: 12,
          paddingLeft: leadingInsetPx,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          WebkitOverflowScrolling: "touch",
        }}
      >
        {onReorder ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
              {filmstripContent}
            </SortableContext>
          </DndContext>
        ) : filmstripContent}

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 5,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 22,
              flexShrink: 0,
              textAlign: "right",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              color: "var(--ink-4)",
              paddingTop: 5,
              lineHeight: 1,
            }}
          >
            {slides.length + 1}
          </span>
          <button
            type="button"
            disabled={!onAppendSlidePrompt || appendSlideBusy}
            onClick={onAppendSlidePrompt || undefined}
            title="Создать новый слайд через ИИ"
            aria-label="Создать новый слайд через ИИ"
            style={{
              flex: 1,
              minWidth: 0,
              margin: 0,
              padding: 4,
              borderRadius: SLIDE_FILMSTRIP_THUMB_RADIUS + 2,
              border: "none",
              background: "transparent",
              cursor: appendSlideBusy ? "progress" : "pointer",
              outline: "none",
              textAlign: "left",
              transition: "background 0.15s, opacity 0.15s",
              boxShadow: "none",
            }}
          >
            <div
              style={{
                aspectRatio: "16 / 9",
                width: "100%",
                borderRadius: SLIDE_FILMSTRIP_THUMB_RADIUS,
                overflow: "hidden",
                border: "1px solid color-mix(in srgb, var(--accent) 30%, var(--line))",
                background: appendSlideBusy
                  ? "color-mix(in srgb, var(--accent) 10%, rgba(255,255,255,.82))"
                  : "color-mix(in srgb, var(--accent) 6%, rgba(255,255,255,.72))",
                display: "grid",
                placeItems: "center",
                color: "var(--accent)",
                boxShadow: "0 0 0 1px rgba(32,33,36,.03)",
              }}
            >
              {appendSlideBusy ? (
                <span aria-label="Создаём слайд" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span className="su-ai-typing-dot" />
                  <span className="su-ai-typing-dot" />
                  <span className="su-ai-typing-dot" />
                </span>
              ) : (
                <Icon name="plus" size={30} stroke={1.9} />
              )}
            </div>
          </button>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          borderTop: "1px solid var(--line)",
          padding: "8px 6px",
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          background: "transparent",
        }}
      >
        <CanvasButton label="Предыдущий слайд" icon="arrow-left" onClick={() => moveSlide(-1)} disabled={navDisabled} />
        <CanvasButton label="Следующий слайд" icon="arrow-right" onClick={() => moveSlide(1)} disabled={navDisabled} />
      </div>
    </div>
  );
}

/** B9: Floating format toolbar for bold / italic / color. */
function FloatingFormatToolbar({ accent = "var(--accent)" }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    function check() {
      const sel = document.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setPos(null); return; }
      const anchor = sel.anchorNode;
      if (!anchor) { setPos(null); return; }
      const el = anchor.nodeType === 3 ? anchor.parentElement : anchor;
      if (!el?.closest("[contenteditable]")) { setPos(null); return; }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      if (rect.width < 2) { setPos(null); return; }
      setPos({ top: rect.top - 42, left: rect.left + rect.width / 2 });
    }
    document.addEventListener("selectionchange", check);
    document.addEventListener("mouseup", () => setTimeout(check, 10));
    return () => {
      document.removeEventListener("selectionchange", check);
      document.removeEventListener("mouseup", () => setTimeout(check, 10));
    };
  }, []);
  if (!pos) return null;
  return (
    <div
      className="format-toolbar"
      style={{ top: pos.top, left: pos.left, transform: "translateX(-50%)" }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button type="button" title="Жирный" onMouseDown={(e) => { e.preventDefault(); document.execCommand("bold"); }}>B</button>
      <button type="button" title="Курсив" style={{ fontStyle: "italic" }} onMouseDown={(e) => { e.preventDefault(); document.execCommand("italic"); }}>I</button>
      <button type="button" title="Акцентный цвет" style={{ color: accent }} onMouseDown={(e) => { e.preventDefault(); document.execCommand("foreColor", false, accent); }}>A</button>
    </div>
  );
}

function CanvasButton({ label, icon, onClick, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      aria-label={label}
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: disabled ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.92)",
        color: "inherit",
        border: "1px solid var(--line)",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: disabled ? "none" : "0 1px 2px rgba(32,33,36,.05)",
      }}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}
