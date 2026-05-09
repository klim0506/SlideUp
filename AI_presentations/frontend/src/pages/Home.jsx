import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Icon, PITCH_SLIDES, PRESENTATION_STYLES, STYLE_PRESETS, StylePreview, canUnlockPreset } from "@/lib/design";
import UpsellModal from "@/components/UpsellModal";
import { freeLandingFeatureItems, studentLandingFeatureItems } from "@/lib/planLimits";
import { setPendingSource } from "@/lib/genHandoff";
import { getMe, logout, navigate } from "@/lib/api";
import { HERO_EXAMPLE_PROMPTS, useTypewriterPlaceholder } from "@/lib/useTypewriterPlaceholder";

const HERO_AUDIENCES = ["дизайнеры", "предприниматели", "менеджеры", "студенты", "компании"];

/** Допустимые типы вложения для окна выбора файла (совместимо с обработкой на сервере и Claude). */
export const HERO_SOURCE_ACCEPT =
  ".pdf,.doc,.docx,.txt,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.bmp,.heic,.heif,.avif,image/*";

const MAX_SLIDES_LOGGED_IN = 20;
/** Без аккаунта можно выбрать до 7 слайдов; 8+ — после входа. */
const MAX_SLIDES_GUEST = 7;
const HERO_DRAFT_STORAGE_KEY = "heroDraft";
let heroDraftMemory = null;

/** Для «Создать»: больше 3 символов после trim (то есть минимум 4). */
export function isHeroPromptValid(prompt) {
  return prompt.trim().length > 3;
}

export default function Home({ workspaceMode = false }) {
  const [prompt, setPrompt] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [styleId, setStyleId] = useState("light");
  const [presentationStyle, setPresentationStyle] = useState("pitch");
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authIntent, setAuthIntent] = useState("login");
  const pendingSlideCountAfterAuthRef = useRef(null);
  const [docFile, setDocFile] = useState(null);
  const [createErr, setCreateErr] = useState("");
  const fileInputRef = useRef(null);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const draftHydratedRef = useRef(false);

  const prevUserRef = useRef(user);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    const memoryDraft = heroDraftMemory;
    if (memoryDraft) {
      setPrompt(memoryDraft.prompt || "");
      setSlideCount(memoryDraft.slideCount || 5);
      setStyleId(memoryDraft.styleId || "light");
      setPresentationStyle(memoryDraft.presentationStyle || "pitch");
      setDocFile(memoryDraft.docFile || null);
      draftHydratedRef.current = true;
      return;
    }

    const raw = sessionStorage.getItem(HERO_DRAFT_STORAGE_KEY);
    if (!raw) {
      draftHydratedRef.current = true;
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      setPrompt(parsed.prompt || "");
      setSlideCount(parsed.slideCount || 5);
      setStyleId(parsed.styleId || "light");
      setPresentationStyle(parsed.presentationStyle || "pitch");
    } catch {
      sessionStorage.removeItem(HERO_DRAFT_STORAGE_KEY);
    } finally {
      draftHydratedRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const draft = {
      prompt,
      slideCount,
      styleId,
      presentationStyle,
      docFile,
    };
    heroDraftMemory = draft;
    sessionStorage.setItem(
      HERO_DRAFT_STORAGE_KEY,
      JSON.stringify({
        prompt,
        slideCount,
        styleId,
        presentationStyle,
      }),
    );
  }, [prompt, slideCount, styleId, presentationStyle, docFile]);

  useEffect(() => {
    const wasLoggedIn = prevUserRef.current != null;
    prevUserRef.current = user;
    if (wasLoggedIn && user == null && slideCount > MAX_SLIDES_GUEST) {
      setSlideCount(MAX_SLIDES_GUEST);
    }
  }, [user, slideCount]);

  useEffect(() => {
    const plan = user?.plan || "free";
    const preset = STYLE_PRESETS.find((p) => p.id === styleId);
    if (preset && !canUnlockPreset(plan, preset)) {
      setStyleId("light");
    }
  }, [user?.plan, styleId]);

  function handleCreate(options = {}) {
    setCreateErr("");
    if (!isHeroPromptValid(prompt)) {
      setCreateErr("Расскажите тему чуть подробнее — от 4 символов без лишних пробелов по краям.");
      document.querySelector(".hero-composer")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const trimmed = prompt.trim();
    const requestedSlideCount = options.slideCount ?? slideCount;

    sessionStorage.setItem(
      "genConfig",
      JSON.stringify({
        prompt: trimmed,
        slides_count: requestedSlideCount,
        theme: styleId,
        style: presentationStyle,
        source_file_name: docFile?.name || "",
        source_mime: docFile?.type || "",
      }),
    );
    setPendingSource(docFile);
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

    navigate("/presentation");
  }

  function closeAuthModal() {
    setAuthOpen(false);
    pendingSlideCountAfterAuthRef.current = null;
    setAuthIntent("login");
  }

  return (
    <div className={workspaceMode ? "su-page editor-dark" : "su-page"}>
      {workspaceMode ? (
        <AppHeader user={user} active="library" onLibrary={() => navigate("/presentation")} onLogout={() => logout()} />
      ) : (
        <SiteHeader user={user} onLogin={() => { setAuthIntent("login"); setAuthOpen(true); }} />
      )}
      <Hero
        workspaceMode={workspaceMode}
        prompt={prompt}
        setPrompt={setPrompt}
        slideCount={slideCount}
        setSlideCount={setSlideCount}
        styleId={styleId}
        setStyleId={setStyleId}
        presentationStyle={presentationStyle}
        setPresentationStyle={setPresentationStyle}
        onCreate={handleCreate}
        docFile={docFile}
        setDocFile={setDocFile}
        fileInputRef={fileInputRef}
        createErr={createErr}
        onClearCreateErr={() => setCreateErr("")}
        isLoggedIn={Boolean(user)}
        onRequestMoreSlidesLogin={(nextCount) => {
          pendingSlideCountAfterAuthRef.current = nextCount;
          setAuthIntent("continue-project");
          setAuthOpen(true);
        }}
        userPlan={user?.plan || "free"}
        onLockedStyle={() => setUpsellOpen(true)}
      />
      {!workspaceMode ? <ValueSection onCreate={handleCreate} canSubmitCreate={isHeroPromptValid(prompt)} /> : null}
      {!workspaceMode ? <HowItWorks /> : null}
      {!workspaceMode ? <Pricing onLogin={() => { setAuthIntent("login"); setAuthOpen(true); }} /> : null}
      {!workspaceMode ? <SiteFooter /> : null}
      <AuthModal open={authOpen} onClose={closeAuthModal} onSuccess={handleAuthSuccess} />
      <UpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </div>
  );
}

function CreateHeader() {
  return (
    <header className="create-workspace-header">
      <div className="create-workspace-header__brand">
        <Icon name="logo" size={26} stroke={2.2} style={{ color: "var(--accent)" }} />
        <span>SlideUp</span>
      </div>
      <button type="button" className="su-btn su-btn-ghost" style={{ fontSize: 15 }} onClick={() => navigate("/presentation")}>
        <Icon name="doc" size={14} />
        Презентации
      </button>
    </header>
  );
}

/** Тот же блок, что под заголовком на лендинге: `.hero-composer`. */
export function LandingHeroComposer({
  prompt,
  setPrompt,
  slideCount,
  setSlideCount,
  styleId,
  setStyleId,
  docFile,
  setDocFile,
  fileInputRef,
  createErr,
  onCreate,
  submitBusy = false,
  isLoggedIn,
  onRequestMoreSlidesLogin,
  userPlan = "free",
  onLockedStyle,
  onClearCreateErr,
  extraHeroActions = null,
  /** На лендинге включён; на экранах «новая презентация» — без микрофона. */
  showSpeech = true,
}) {
  const speechSupported =
    showSpeech &&
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const recognitionRef = useRef(null);
  const speechBaseRef = useRef("");
  const [speechListening, setSpeechListening] = useState(false);
  const textareaRef = useRef(null);
  const animatedPlaceholder = useTypewriterPlaceholder(HERO_EXAMPLE_PROMPTS, {
    paused: prompt.length > 0 || submitBusy,
  });

  useEffect(() => {
    // Курсор сразу в поле — чтобы можно было начать печатать без дополнительных кликов.
    if (submitBusy) return;
    const ta = textareaRef.current;
    if (!ta) return;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== ta) {
      // Не перехватываем фокус, если пользователь уже взаимодействует с другим полем.
      return;
    }
    try {
      ta.focus({ preventScroll: true });
    } catch {
      ta.focus();
    }
  }, [submitBusy]);

  useEffect(() => {
    if (!showSpeech) return undefined;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let chunk = "";
      for (let i = 0; i < event.results.length; i++) {
        chunk += event.results[i][0].transcript;
      }
      const spoken = chunk.trim();
      const base = speechBaseRef.current.trimEnd();
      const glue = base && spoken ? " " : "";
      onClearCreateErr?.();
      setPrompt(base + glue + spoken);
    };

    recognition.onerror = () => {
      setSpeechListening(false);
    };

    recognition.onend = () => {
      setSpeechListening(false);
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [setPrompt, onClearCreateErr, showSpeech]);

  function toggleSpeechInput() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    if (speechListening) {
      recognition.stop();
      return;
    }
    speechBaseRef.current = prompt;
    try {
      recognition.start();
      setSpeechListening(true);
    } catch {
      setSpeechListening(false);
    }
  }

  return (
    <div className="hero-composer hero-composer--flat">
      <textarea
        ref={textareaRef}
        value={prompt}
        onChange={(event) => {
          onClearCreateErr?.();
          setPrompt(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !submitBusy) {
            void onCreate();
          }
        }}
        placeholder={animatedPlaceholder || "Например: стратегия запуска ИИ-продукта для B2B SaaS на 5 слайдов"}
        className="hero-textarea"
        disabled={submitBusy}
        autoFocus
      />

      {docFile ? (
        <div className="hero-file-chip">
          <Icon name="paperclip" size={14} />
          <span>{docFile.name}</span>
          <button type="button" onClick={() => setDocFile(null)} aria-label="Убрать файл">
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      <div className="hero-controls">
        <div className="hero-controls-start">
          {speechSupported ? (
            <button
              type="button"
              className="hero-mic-btn hero-icon-tooltip"
              data-active={speechListening}
              aria-label={speechListening ? "Остановить голосовой ввод" : "Голосовой ввод"}
              aria-pressed={speechListening}
              onClick={toggleSpeechInput}
              disabled={submitBusy}
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
            data-active={Boolean(docFile)}
            aria-label="Вложить файл"
            onClick={() => fileInputRef.current?.click()}
            disabled={submitBusy}
          >
            <Icon name="paperclip" size={18} stroke={2} />
            <span className="hero-icon-tooltip__bubble" role="tooltip">
              PDF, Word, PPTX, фото
            </span>
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept={HERO_SOURCE_ACCEPT}
          style={{ display: "none" }}
          onChange={(event) => setDocFile(event.target.files?.[0] ?? null)}
        />

        <div className="hero-actions">
          {extraHeroActions}
          <StylePicker value={styleId} onChange={setStyleId} userPlan={userPlan} onLockedPreset={onLockedStyle} />
          <Stepper
            count={slideCount}
            setCount={setSlideCount}
            isLoggedIn={isLoggedIn}
            onRequestMoreSlidesLogin={onRequestMoreSlidesLogin}
          />
          <button
            type="button"
            className="su-btn su-btn-accent hero-submit-btn"
            disabled={submitBusy}
            onClick={() => void onCreate()}
          >
            {submitBusy ? "Создаём…" : <>Создать <Icon name="arrow-right" size={16} /></>}
          </button>
        </div>
      </div>
      {createErr ? <div className="su-user-hint" style={{ marginTop: 10, marginInline: 6 }}>{createErr}</div> : null}
    </div>
  );
}

function Hero({
  workspaceMode = false,
  prompt,
  setPrompt,
  slideCount,
  setSlideCount,
  styleId,
  setStyleId,
  presentationStyle,
  setPresentationStyle,
  onCreate,
  docFile,
  setDocFile,
  fileInputRef,
  createErr,
  onClearCreateErr,
  isLoggedIn,
  onRequestMoreSlidesLogin,
  userPlan = "free",
  onLockedStyle,
}) {
  const activeStyleName = (STYLE_PRESETS.find((preset) => preset.id === styleId) || STYLE_PRESETS[0]).name;
  const activePresentationStyleName = (PRESENTATION_STYLES.find((s) => s.id === presentationStyle) || PRESENTATION_STYLES[0]).name;

  if (workspaceMode) {
    return (
      <section className="landing-hero create-workspace-shell">
        <div className="create-workspace-layout">
          <div className="create-workspace-panel">
            <div className="create-workspace-copy">
              <div>
                <h1 className="create-workspace-title">Новая презентация</h1>
                <div className="create-workspace-meta">
                  <span>{slideCount} {slidesDeclension(slideCount)}</span>
                  <span>{activePresentationStyleName}</span>
                  <span>{activeStyleName}</span>
                  <span>{docFile?.name || "Только описание"}</span>
                </div>
              </div>
              <button
                type="button"
                className="su-btn su-btn-outline create-workspace-secondary-action"
                onClick={() => navigate("/presentation")}
              >
                <Icon name="doc" size={14} />
                Мои презентации
              </button>
            </div>

            <LandingHeroComposer
              prompt={prompt}
              setPrompt={setPrompt}
              slideCount={slideCount}
              setSlideCount={setSlideCount}
              styleId={styleId}
              setStyleId={setStyleId}
              docFile={docFile}
              setDocFile={setDocFile}
              fileInputRef={fileInputRef}
              createErr={createErr}
              onCreate={onCreate}
              submitBusy={false}
              isLoggedIn={isLoggedIn}
              onRequestMoreSlidesLogin={onRequestMoreSlidesLogin}
              userPlan={userPlan}
              onLockedStyle={onLockedStyle}
              onClearCreateErr={onClearCreateErr}
              showSpeech={false}
              extraHeroActions={<PresentationStylePicker value={presentationStyle} onChange={setPresentationStyle} />}
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="landing-hero">
      <div className="hero-eyebrow">
        <span style={{ width: 6, height: 6, background: "var(--accent)", borderRadius: 999 }} />
        Презентации нового поколения: качественно, быстро и готово к показу
      </div>

      <h1 className="hero-title">
        <span>Создавайте презентации нового поколения</span>
        <span className="hero-title-accent">за 30 секунд</span>
      </h1>
      <p className="hero-copy">
        Загрузите идею, документ, презентацию PPTX или изображение — SlideUp за секунды соберёт убедительную презентацию с чёткой структурой и современным дизайном. Вложение передаётся в модель Claude вместе с вашим текстом. Останется только показать её клиенту или экспортировать в PPTX/PDF.
      </p>

      <LandingHeroComposer
        prompt={prompt}
        setPrompt={setPrompt}
        slideCount={slideCount}
        setSlideCount={setSlideCount}
        styleId={styleId}
        setStyleId={setStyleId}
        docFile={docFile}
        setDocFile={setDocFile}
        fileInputRef={fileInputRef}
        createErr={createErr}
        onCreate={onCreate}
        submitBusy={false}
        isLoggedIn={isLoggedIn}
        onRequestMoreSlidesLogin={onRequestMoreSlidesLogin}
        userPlan={userPlan}
        onLockedStyle={onLockedStyle}
        onClearCreateErr={onClearCreateErr}
      />

      <div className="hero-preview-wrap"><HeroPreview /></div>
    </section>
  );
}

export function StylePicker({ value, onChange, userPlan = "free", onLockedPreset }) {
  const [open, setOpen] = useState(false);
  const [hoveredPresetId, setHoveredPresetId] = useState(null);
  const pickerRef = useRef(null);
  const selectedPreset = STYLE_PRESETS.find((preset) => preset.id === value) || STYLE_PRESETS[0];
  const dropdownHintPreset = STYLE_PRESETS.find((preset) => preset.id === hoveredPresetId) || selectedPreset;

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!open) {
      setHoveredPresetId(null);
    }
  }, [open]);

  return (
    <div ref={pickerRef} className={`hero-action-picker${open ? " hero-action-picker--open" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={open ? undefined : "hero-style-hover-tip"}
        aria-label={`${selectedPreset.name}`}
        className="hero-action-picker-btn"
      >
        <div className="hero-action-picker-thumb">
          <StylePreview preset={selectedPreset} />
        </div>
        <Icon name="chevron-down" size={15} style={{ color: "var(--ink-3)" }} />
      </button>

      {!open ? (
        <div id="hero-style-hover-tip" className="hero-style-desc" role="tooltip">
          <p className="hero-style-desc-kicker">Стиль презентации</p>
          <p className="hero-style-desc-title">{selectedPreset.name}</p>
          <p className="hero-style-desc-text">{selectedPreset.description}</p>
          <span className="hero-style-desc-note">{selectedPreset.note}</span>
        </div>
      ) : null}

      {open ? (
        <div className="hero-style-dropdown" role="listbox" aria-label="Выбор стиля">
          <div className="hero-style-dropdown-grid">
            {STYLE_PRESETS.map((preset) => {
              const locked = !canUnlockPreset(userPlan, preset);
              return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={preset.id === value}
                aria-disabled={locked}
                onMouseEnter={() => setHoveredPresetId(preset.id)}
                onClick={() => {
                  if (locked) {
                    onLockedPreset?.();
                    return;
                  }
                  onChange(preset.id);
                  setOpen(false);
                }}
                className="hero-style-dropdown-row"
                data-active={preset.id === value}
                style={locked ? { opacity: 0.62 } : undefined}
              >
                <div className="hero-style-dropdown-thumb" style={{ position: "relative" }}>
                  <StylePreview preset={preset} />
                  {locked ? (
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: "rgba(15,23,42,.55)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#fff",
                      }}
                      aria-hidden
                    >
                      <Icon name="lock" size={12} stroke={2} />
                    </span>
                  ) : null}
                </div>
                <span className="hero-style-dropdown-row-label">{preset.name}</span>
              </button>
            );})}
          </div>
          <div className="hero-style-dropdown-hint">
            <p className="hero-style-dropdown-hint-title">{dropdownHintPreset.name}</p>
            <p className="hero-style-dropdown-hint-text">{dropdownHintPreset.description}</p>
            <span className="hero-style-dropdown-hint-note">{dropdownHintPreset.note}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PresentationStylePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(null);
  const ref = useRef(null);
  const selected = PRESENTATION_STYLES.find((s) => s.id === value) || PRESENTATION_STYLES[0];
  const hint = PRESENTATION_STYLES.find((s) => s.id === hovered) || selected;

  useEffect(() => {
    function handleOutside(e) {
      if (!ref.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (!open) setHovered(null);
  }, [open]);

  return (
    <div ref={ref} className={`hero-action-picker${open ? " hero-action-picker--open" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${selected.name}`}
        className="hero-action-picker-btn"
        style={{ minWidth: 110 }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap" }}>
          {selected.name}
        </span>
        <Icon name="chevron-down" size={15} style={{ color: "var(--ink-3)", flexShrink: 0 }} />
      </button>

      {!open ? (
        <div className="hero-style-desc" role="tooltip">
          <p className="hero-style-desc-kicker">Стиль презентации</p>
          <p className="hero-style-desc-title">{selected.name}</p>
          <p className="hero-style-desc-text">{selected.description}</p>
          <span className="hero-style-desc-note">{selected.note}</span>
        </div>
      ) : null}

      {open ? (
        <div className="hero-style-dropdown" role="listbox" aria-label="Выбор стиля презентации"
          style={{ minWidth: 260 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "6px 6px 4px" }}>
            {PRESENTATION_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === value}
                onMouseEnter={() => setHovered(s.id)}
                onClick={() => { onChange(s.id); setOpen(false); }}
                className="hero-style-dropdown-row"
                data-active={s.id === value}
                style={{ padding: "8px 10px", borderRadius: "var(--r-sm)", display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", textAlign: "left" }}
              >
                <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)" }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "var(--font-mono)" }}>{s.note}</span>
              </button>
            ))}
          </div>
          <div className="hero-style-dropdown-hint">
            <p className="hero-style-dropdown-hint-title">{hint.name}</p>
            <p className="hero-style-dropdown-hint-text">{hint.description}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 1 слайд, 2–4 слайда, 5+ слайдов; 11–14 слайдов; 21 слайд, 22 слайда… */
export function slidesDeclension(n) {
  const k = Math.abs(Math.trunc(Number(n))) || 0;
  const mod100 = k % 100;
  const mod10 = k % 10;
  if (mod100 >= 11 && mod100 <= 14) return "слайдов";
  if (mod10 === 1) return "слайд";
  if (mod10 >= 2 && mod10 <= 4) return "слайда";
  return "слайдов";
}

export function Stepper({ count, setCount, isLoggedIn, onRequestMoreSlidesLogin }) {
  function increment() {
    if (count >= MAX_SLIDES_LOGGED_IN) return;
    const next = count + 1;
    if (!isLoggedIn && count >= MAX_SLIDES_GUEST) {
      onRequestMoreSlidesLogin?.(next);
      return;
    }
    setCount(Math.min(MAX_SLIDES_LOGGED_IN, next));
  }

  function decrement() {
    setCount(Math.max(1, count - 1));
  }

  return (
    <div className="hero-stepper">
      <button type="button" onClick={decrement} style={smallButton}>−</button>
      <span style={{ minWidth: 100, textAlign: "center", fontSize: 15, color: "var(--ink)" }}>
        {count} {slidesDeclension(count)}
      </span>
      <button type="button" onClick={increment} style={smallButton}>+</button>
    </div>
  );
}

const smallButton = { width: 34, height: 34, borderRadius: "calc(var(--r-md) - 3px)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", fontSize: 18 };

function HeroPreview() {
  const metricsSlide = PITCH_SLIDES.find((slide) => slide.kind === "metrics");
  const [audienceIndex, setAudienceIndex] = useState(0);
  const [typedAudience, setTypedAudience] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  function metricHeadline(value) {
    const slash = value.indexOf("/");
    if (slash === -1) return value;
    return (
      <>
        {value.slice(0, slash)}
        <span
          aria-hidden="true"
          style={{
            fontWeight: 450,
            opacity: 0.48,
            fontSize: "0.82em",
            display: "inline-block",
            transform: "translateY(-0.04em)",
          }}
        >
          /
        </span>
        {value.slice(slash + 1)}
      </>
    );
  }

  useEffect(() => {
    const word = HERO_AUDIENCES[audienceIndex];
    if (!isDeleting && typedAudience === word) {
      const pauseTimer = window.setTimeout(() => setIsDeleting(true), 1400);
      return () => window.clearTimeout(pauseTimer);
    }

    if (isDeleting && typedAudience.length === 0) {
      setIsDeleting(false);
      setAudienceIndex((index) => (index + 1) % HERO_AUDIENCES.length);
      return undefined;
    }

    const stepTimer = window.setTimeout(() => {
      if (isDeleting) {
        setTypedAudience(word.slice(0, Math.max(0, typedAudience.length - 1)));
      } else {
        setTypedAudience(word.slice(0, typedAudience.length + 1));
      }
    }, isDeleting ? 55 : 85);

    return () => window.clearTimeout(stepTimer);
  }, [audienceIndex, typedAudience, isDeleting]);

  return (
    <div
      id="about"
      style={{
      marginTop: 100,
      marginInline: "calc(50% - 50vw)",
      background:
        "linear-gradient(135deg, rgba(29, 78, 216, 0.86) 0%, rgba(37, 99, 235, 0.8) 42%, rgba(59, 130, 246, 0.74) 100%)",
      border: "none",
      boxShadow: "0 14px 34px rgba(37, 99, 235, 0.16)",
      padding: "50px max(24px, 6vw) 70px",
    }}
    >
      <div style={{ maxWidth: 1040, marginInline: "auto" }}>
      <div style={{ textAlign: "center", marginBottom: 30 }}>
        <h3 style={{ margin: 0, paddingBottom: 30, fontSize: "clamp(30px, 4.2vw, 46px)", lineHeight: 1.1, letterSpacing: "-0.02em", fontWeight: 760, color: "#ffffff", textShadow: "0 6px 16px rgba(23, 78, 166, 0.18)", whiteSpace: "nowrap" }}>
          SlideUp уже используют{" "}
          <span className="hero-audience-slot">
            <span className="hero-audience-word">{typedAudience}</span>
            <span className="hero-audience-caret" aria-hidden="true">|</span>
          </span>
        </h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
        {(metricsSlide?.metrics || []).map((metric) => (
          <div key={metric.l} style={{ borderTop: "2px solid rgba(224, 242, 254, 0.68)", paddingTop: 30 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(28px, 4.6vw, 46px)", lineHeight: 1, fontWeight: 760, letterSpacing: "-0.03em", color: "#ffffff" }}>{metricHeadline(metric.v)}</div>
            <div style={{ marginTop: 5, fontSize: 16, fontWeight: 700, color: "rgba(244, 249, 255, 0.95)" }}>{metric.l}</div>
            <div style={{ marginTop: 4, color: "rgba(224, 236, 252, 0.84)", fontSize: 13 }}>{metric.d}</div>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(30px, 3.8vw, 46px)", fontWeight: 760, letterSpacing: 0, margin: 0, lineHeight: 1.08, textWrap: "balance" }}>{title}</h2>
      <p style={{ color: "var(--ink-2)", marginTop: 12, fontSize: 16, lineHeight: 1.55 }}>{sub}</p>
    </div>
  );
}

function ValueSection({ onCreate, canSubmitCreate }) {
  const items = [
    { icon: "sparkles", title: "Качество вместо черновика", body: "Четкая структура, сильные формулировки и визуальный ритм для встреч." },
    { icon: "doc", title: "Структура из исходников", body: "Загрузите тему или документ, SlideUp соберет понятный порядок слайдов." },
    { icon: "chart", title: "Логика, которая продает идею", body: "Повествование: проблема, решение, аргументы и следующий шаг." },
    { icon: "settings", title: "Дизайн без ручной сборки", body: "Единый стиль и аккуратная композиция без ручного выравнивания." },
    { icon: "edit", title: "Правки в нужном месте", body: "Попросите ИИ сделать конкретный слайд короче и точнее." },
    { icon: "download", title: "Сразу показать или отправить", body: "Откройте в браузере и экспортируйте в PPTX или PDF." },
  ];
  return (
    <section id="value" className="landing-section" style={{ borderTop: "1px solid var(--line)", paddingTop: 70, paddingBottom: 70 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <SectionHead title="Что получает пользователь" sub="Не шаблон и не сырой AI-ответ, а готовую презентацию нового поколения: с логикой, дизайном и понятной подачей." />
        <div className="landing-grid landing-grid-3 value-grid">
          {items.map((item) => (
            <div key={item.title} className="su-card landing-value-card">
              <Icon name={item.icon} size={32} stroke={2} className="value-card-icon" />
              <div className="value-card-title">{item.title}</div>
              <div className="value-card-body">{item.body}</div>
            </div>
          ))}
        </div>
        <div className="value-cta">
          <button
            type="button"
            onClick={onCreate}
            disabled={!canSubmitCreate}
            className="su-btn su-btn-accent"
            style={{ padding: "14px 24px", fontSize: 16 }}
          >
            <Icon name="arrow-right" size={17} />
            Создать презентацию
          </button>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "1", t: "Дайте исходник", d: "Тема, тезисы, бриф или документ. Этого достаточно, чтобы начать." },
    { n: "2", t: "Получите структуру и дизайн", d: "SlideUp собирает логику, пишет слайды и применяет современный стиль." },
    { n: "3", t: "Покажите результат", d: "Откройте в браузере, поправьте один слайд и экспортируйте в PPTX или PDF." },
  ];
  const icons = ["doc", "sparkles", "download"];
  return (
    <section
      id="how"
      className="landing-section"
      style={{
        paddingTop: 70,
        paddingBottom: 70,
        borderTop: "1px solid var(--line)",
        backgroundColor: "var(--accent-soft)",
        backgroundImage: "linear-gradient(180deg, var(--bg) 0%, var(--accent-soft) 100%)",
        backgroundSize: "100% min(112px, 22vw)",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "top center",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <SectionHead title="От идеи до готовой презентации" sub="Короткий путь без ручной сборки, копирования между инструментами и долгой доводки дизайна." />
        <div className="how-pipeline">
          {steps.map((step, index) => (
            <div key={step.n} className="how-step-card">
              <div className="how-step-top">
                <span className="how-step-number">0{step.n}</span>
                <span className="how-step-icon">
                  <Icon name={icons[index]} size={19} stroke={1.8} />
                </span>
              </div>
              <div className="how-step-title">{step.t}</div>
              <div className="how-step-body">{step.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Месяц из годовой суммы даёт дробь; на лендинге округляют до шага (часто 10 ₽) или задают год кратным 12 в прайсе. */
function landingMonthlyDisplayRub(yearlyRub, stepRub = 10) {
  const raw = yearlyRub / 12;
  return Math.round(raw / stepRub) * stepRub;
}

function Pricing({ onLogin }) {
  const plans = [
    { name: "Free", price: "Бесплатно", note: "попробовать идею", items: freeLandingFeatureItems() },
    {
      name: "Student",
      note: "для учёбы и личных проектов",
      landingPrice: {
        fromMonthlyRubYearlyPay: landingMonthlyDisplayRub(4469),
      },
      items: studentLandingFeatureItems(),
    },
    {
      name: "Pro",
      note: "для работы и предпринимательства",
      landingPrice: {
        fromMonthlyRubYearlyPay: landingMonthlyDisplayRub(12677),
      },
      items: ["Безлимитные слайды", "Публичные ссылки", "Приоритетная генерация", "PDF и PPTX без лимита"],
      popular: true,
    },
  ];
  return (
    <section id="pricing" className="landing-section" style={{ paddingTop: 70, paddingBottom: 70 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>
        <SectionHead title="Создавайте без ограничений" sub="Платите за готовые слайды, экспорт и возможность делиться результатом с командой или клиентом." />
        <div className="landing-grid landing-grid-3" style={{ marginTop: 36 }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{ padding: 28, borderRadius: "var(--r-lg)", background: plan.popular ? "linear-gradient(155deg, color-mix(in srgb, var(--accent) 92%, white) 0%, #4f8df7 42%, var(--accent-deep) 100%)" : "var(--surface)", color: plan.popular ? "var(--accent-fg)" : "var(--ink)", border: plan.popular ? "1px solid rgba(255, 255, 255, 0.24)" : "1px solid var(--line)", position: "relative", boxShadow: plan.popular ? "0 20px 46px -22px rgba(37, 99, 235, 0.34), 0 10px 24px rgba(37, 99, 235, 0.14)" : undefined, display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={{ fontSize: 16, opacity: 0.7, marginBottom: 4 }}>{plan.name}</div>
              <div style={{ fontSize: 13, opacity: plan.popular ? 0.86 : 0.58, marginBottom: 24 }}>{plan.note}</div>
              {plan.landingPrice ? (
                <div style={{ fontSize: 36, fontWeight: 780, letterSpacing: "-0.04em", marginBottom: 26, lineHeight: 1.12 }}>
                  <span
                    style={{
                      fontSize: "0.5em",
                      fontWeight: 750,
                      opacity: plan.popular ? 0.9 : 0.72,
                      marginRight: "0.22em",
                      verticalAlign: "0.2em",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    от
                  </span>
                  {plan.landingPrice.fromMonthlyRubYearlyPay.toLocaleString("ru-RU")} ₽/мес
                </div>
              ) : (
                <div style={{ fontSize: 36, fontWeight: 780, letterSpacing: "-0.04em", marginBottom: 26 }}>{plan.price}</div>
              )}
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {plan.items.map((item) => (
                  <li key={item} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 14, opacity: plan.popular ? 0.96 : 0.92 }}>
                    <Icon name="check" size={14} stroke={2} /> <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: "auto", paddingTop: 28 }}>
                <button
                  type="button"
                  onClick={onLogin}
                  className={plan.popular ? "su-btn su-btn-pricing-popular" : "su-btn su-btn-outline"}
                  style={{
                    width: "100%",
                    fontWeight: 700,
                  }}
                >
                  Выбрать {plan.name}
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
