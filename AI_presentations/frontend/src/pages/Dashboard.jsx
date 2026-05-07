import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import UpsellModal from "@/components/UpsellModal";
import { Icon, SlideThumb, presentationStyleCaption } from "@/lib/design";
import { apiFetch, apiJson, getAccessToken, getMe, logout, navigate } from "@/lib/api";

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

/** First slide + counts for grid/list preview (falls back to wireframe if deck has no slides). */
function deckPreviewThumbProps(deck) {
  const slides = Array.isArray(deck.slides) ? deck.slides : [];
  const totalRaw = deck.slide_count ?? slides.length ?? 1;
  const slideTotal = Math.max(1, Number(totalRaw) || 1);
  const theme = deck.theme || "light";
  const themeCustom = deck.theme_custom ?? null;
  if (!slides.length) {
    return { slide: { kind: "two-column" }, theme, themeCustom, slideIndex: 0, slideTotal };
  }
  return { slide: slides[0], theme, themeCustom, slideIndex: 0, slideTotal };
}

export default function Dashboard() {
  const [presentations, setPresentations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState("grid");
  const [authOpen, setAuthOpen] = useState(!getAccessToken());
  const [user, setUser] = useState(null);
  const [exportNotice, setExportNotice] = useState("");
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
    loadPresentations();
  }, []);

  async function loadPresentations() {
    if (!getAccessToken()) {
      setLoading(false);
      setAuthOpen(true);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const data = await apiJson("/api/presentations/");
      setPresentations(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      if (err.status === 401) setAuthOpen(true);
      else setError(err.message || "Список презентаций сейчас не загрузился — попробуйте обновить страницу.");
    } finally {
      setLoading(false);
    }
  }

  function requestDeletePresentation(deck, event) {
    event.stopPropagation();
    setPendingDelete({ id: deck.id, title: deck.title || "Без названия" });
  }

  function handlePresentationDeleted(id) {
    setPresentations((items) => items.filter((item) => item.id !== id));
    setPendingDelete(null);
  }

  async function downloadPresentation(deck, format, event) {
    event.stopPropagation();
    setExportNotice("");
    setUpsellOpen(false);
    try {
      const response = await apiFetch(`/api/export/${deck.id}/${format}/`);
      if (response.status === 401) {
        setAuthOpen(true);
        return;
      }
      if (response.status === 403) {
        const data = await response.json().catch(() => ({}));
        if (data.show_upsell) setUpsellOpen(true);
        setExportNotice(data.detail || "Экспорт на вашем тарифе пока недоступен — можно оформить подписку выше.");
        return;
      }
      if (!response.ok) {
        setExportNotice("Файл не получилось подготовить — попробуйте ещё раз чуть позже.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const base = (deck.title || "presentation").replace(/[/\\?%*:|"<>]/g, "_");
      link.download = `${base}.${format}`;
      link.click();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch {
      setExportNotice("Скачивание прервалось — проверьте сеть и попробуйте снова.");
    }
  }

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = presentations.filter((item) => !normalizedSearch || item.title?.toLowerCase().includes(normalizedSearch));

  return (
    <div className="su-page">
      <AppHeader user={user} active="library" onLogout={() => { logout(); navigate("/"); }} />

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "32px max(24px, 5vw) 88px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "clamp(34px, 4.6vw, 48px)", lineHeight: 1.02, letterSpacing: "-0.04em" }}>
            Мои презентации
          </h1>

          <button className="su-btn su-btn-accent" onClick={() => navigate("/create")} style={{ minHeight: 44, paddingInline: 18 }}>
            <Icon name="plus" size={14} /> Создать презентацию
          </button>
        </div>

        {error ? <div className="su-user-hint" style={{ marginBottom: 20 }}>{error}</div> : null}

        {exportNotice ? (
          <div className="su-user-hint" style={{ marginBottom: 20, background: "color-mix(in srgb, var(--accent) 6%, var(--surface))" }}>
            {exportNotice}
          </div>
        ) : null}

        {loading ? (
          <LoadingSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onCreate={() => navigate("/create")} hasSearch={search.length > 0} />
        ) : (
          <section style={{ display: "grid", gap: 18 }}>
            <div className="su-card" style={toolbarCardStyle}>
              <div style={{ minWidth: 180 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
                  {filtered.length} {plural(filtered.length, "проект", "проекта", "проектов")}
                </div>
                {search.trim() ? (
                  <div style={{ marginTop: 4, fontSize: 13, color: "var(--ink-3)" }}>
                    {`Найдено по запросу "${search.trim()}"`}
                  </div>
                ) : null}
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, flex: "1 1 420px", flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 320px", minWidth: 240 }}>
                  <Icon name="search" size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-3)" }} />
                  <input
                    className="su-input"
                    placeholder="Найти презентацию"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    style={{ paddingLeft: 34 }}
                  />
                </div>

                <div style={viewToggle}>
                  <button type="button" onClick={() => setView("grid")} style={iconButton(view === "grid")} title="Карточки" aria-label="Показать карточками">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="7" height="7" />
                      <rect x="14" y="3" width="7" height="7" />
                      <rect x="3" y="14" width="7" height="7" />
                      <rect x="14" y="14" width="7" height="7" />
                    </svg>
                  </button>
                  <button type="button" onClick={() => setView("list")} style={iconButton(view === "list")} title="Список" aria-label="Показать списком">
                    <Icon name="menu" size={14} />
                  </button>
                </div>
              </div>
            </div>

            {view === "grid" ? (
              <DeckGrid decks={filtered} onOpen={(deck) => navigate(`/presentation/${deck.id}`)} onRequestDelete={requestDeletePresentation} onDownload={downloadPresentation} />
            ) : (
              <DeckList decks={filtered} onOpen={(deck) => navigate(`/presentation/${deck.id}`)} onRequestDelete={requestDeletePresentation} onDownload={downloadPresentation} />
            )}
          </section>
        )}
      </main>

      <AuthModal
        open={authOpen}
        onClose={() => { setAuthOpen(false); navigate("/"); }}
        onSuccess={() => {
          getMe().then(setUser).catch(() => null);
          loadPresentations();
        }}
      />

      <UpsellModal open={upsellOpen} onClose={() => setUpsellOpen(false)} />

      <DeletePresentationModal deck={pendingDelete} onClose={() => setPendingDelete(null)} onDeleted={handlePresentationDeleted} />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="su-card" style={{ overflow: "hidden", boxShadow: "var(--sh-sm)" }}>
          <div style={{ aspectRatio: "16 / 9", background: "var(--surface-2)", animation: "pulse 1.4s ease infinite" }} />
          <div style={{ padding: "14px 18px 18px" }}>
            <div style={{ height: 10, width: "60%", background: "var(--line)", borderRadius: 4, marginBottom: 8 }} />
            <div style={{ height: 8, width: "40%", background: "var(--line)", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate, hasSearch }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px dashed var(--line-2)", borderRadius: "var(--r-lg)", padding: "max(64px, 8vw) 24px", textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--accent-soft)", color: "var(--accent)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
        <Icon name="sparkles" size={24} />
      </div>
      <h2 style={{ fontSize: 28, fontWeight: 760, letterSpacing: "-0.035em", margin: "0 0 10px" }}>
        {hasSearch ? "Ничего не найдено" : "Создайте первую презентацию"}
      </h2>
      <p style={{ color: "var(--ink-2)", maxWidth: 480, margin: "0 auto 28px", lineHeight: 1.55 }}>
        {hasSearch ? "Попробуйте другой запрос." : "История, экспорт и публичные ссылки появятся здесь после первой генерации."}
      </p>
      {!hasSearch ? (
        <button onClick={onCreate} className="su-btn su-btn-primary" style={{ padding: "12px 22px", fontSize: 15 }}>
          <Icon name="plus" size={16} /> Создать презентацию
        </button>
      ) : null}
    </div>
  );
}

function DeckExportDropdown({ deck, onExport, triggerClassName }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  const items = [
    { format: "pdf", label: "pdf" },
    { format: "pptx", label: "pptx" },
    { format: "html", label: "html" },
  ];

  return (
    <div ref={rootRef} className="deck-export-dropdown">
      <button
        type="button"
        className={triggerClassName}
        title="Скачать"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
      >
        <Icon name="download" size={16} stroke={2} />
      </button>
      {open ? (
        <div className="deck-export-dropdown__panel" role="menu">
          {items.map(({ format, label }) => (
            <button
              key={format}
              type="button"
              role="menuitem"
              className="deck-export-dropdown__item"
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                onExport(deck, format, event);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DeckGrid({ decks, onOpen, onRequestDelete, onDownload }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 320px))", gap: 18 }}>
      {decks.map((deck) => (
        <div
          key={deck.id}
          role="button"
          tabIndex={0}
          className="su-card deck-grid-card"
          style={{
            ...deckCardStyle,
            overflow: "visible",
            cursor: "pointer",
            borderRadius: "var(--r-lg)",
          }}
          onClick={() => onOpen(deck)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(deck);
            }
          }}
        >
          <div style={{ padding: 14, paddingBottom: 0, overflow: "hidden", borderRadius: "var(--r-lg) var(--r-lg) 0 0" }}>
            <SlideThumb {...deckPreviewThumbProps(deck)} />
          </div>
          <div style={{ padding: "14px 18px 18px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
              <span
                style={{ ...presentationStyleChip, flex: 1, minWidth: 0 }}
                title={presentationStyleCaption(deck.theme)}
              >
                {presentationStyleCaption(deck.theme)}
              </span>
              <div className="deck-grid-card__actions">
                <DeckExportDropdown deck={deck} onExport={onDownload} triggerClassName="deck-grid-card__action" />
                <button
                  type="button"
                  className="deck-grid-card__action deck-grid-card__action--danger"
                  title="Удалить"
                  aria-label="Удалить презентацию"
                  onClick={(event) => onRequestDelete(deck, event)}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, lineHeight: 1.3 }}>{deck.title || "Без названия"}</div>
            <div style={{ display: "flex", gap: 10, color: "var(--ink-3)", fontSize: 12 }}>
              <span>{deck.slide_count ?? deck.slides_count ?? "—"} слайдов</span>
              <span>·</span>
              <span>{formatDate(deck.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeckList({ decks, onOpen, onRequestDelete, onDownload }) {
  return (
    <div className="su-card" style={{ overflow: "visible", boxShadow: "var(--sh-sm)", borderRadius: "var(--r-lg)" }}>
      {decks.map((deck, index) => (
        <div
          key={deck.id}
          className="deck-list-row"
          role="button"
          tabIndex={0}
          style={{
            display: "grid",
            gridTemplateColumns: "72px minmax(0, 1fr) minmax(0, 220px) auto minmax(104px, auto)",
            gap: 14,
            alignItems: "center",
            padding: "14px 16px",
            borderBottom: index < decks.length - 1 ? "1px solid var(--line)" : "none",
            cursor: "pointer",
          }}
          onClick={() => onOpen(deck)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpen(deck);
            }
          }}
        >
          <div style={{ width: 64 }}>
            <SlideThumb {...deckPreviewThumbProps(deck)} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {deck.title || "Без названия"}
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {deck.slide_count ?? deck.slides_count ?? "—"} слайдов
            </div>
          </div>
          <div style={{ ...presentationStyleChip, minWidth: 0 }} title={presentationStyleCaption(deck.theme)}>
            {presentationStyleCaption(deck.theme)}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{formatDate(deck.created_at)}</div>
          <div className="deck-list-row__actions">
            <DeckExportDropdown deck={deck} onExport={onDownload} triggerClassName="deck-list-row__action" />
            <button type="button" className="deck-list-row__action deck-list-row__action--danger" title="Удалить" aria-label="Удалить презентацию" onClick={(event) => onRequestDelete(deck, event)}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function DeletePresentationModal({ deck, onClose, onDeleted }) {
  const [confirmWord, setConfirmWord] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfirmWord("");
    setBusy(false);
  }, [deck?.id]);

  if (!deck) return null;

  const canSubmit = confirmWord.trim() === "удалить";

  async function handleConfirm() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      const response = await apiFetch(`/api/presentations/${deck.id}/`, { method: "DELETE" });
      if (response.ok) onDeleted(deck.id);
      else onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,19,15,.55)",
        backdropFilter: "blur(4px)",
        zIndex: 110,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        animation: "fadeIn 200ms var(--ease) both",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(440px, 92vw)",
          background: "var(--surface)",
          borderRadius: "var(--r-lg)",
          boxShadow: "var(--sh-lg)",
          overflow: "hidden",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <span style={{ fontWeight: 750, fontSize: 18, color: "var(--ink)", letterSpacing: "-0.02em" }}>Удалить презентацию</span>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{ width: 32, height: 32, borderRadius: 999, color: "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              padding: "16px 18px",
              borderRadius: "var(--r-md)",
              border: "1px solid #fecaca",
              background: "linear-gradient(145deg, #fef2f2 0%, #fff7ed 55%, #ffffff 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.85)",
            }}
          >
            <div style={{ fontWeight: 750, fontSize: 15, color: "#991b1b", marginBottom: 8, letterSpacing: "-0.01em" }}>Удаление необратимо</div>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#7f1d1d" }}>
              Презентация «{deck.title}» будет удалена без возможности восстановления: файл исчезнет из библиотеки и с сервера.
            </p>
          </div>

          <div>
            <label htmlFor="deck-delete-confirm" style={{ display: "block", fontSize: 13, fontWeight: 650, color: "var(--ink-2)", marginBottom: 8 }}>
              Чтобы подтвердить, введите слово <span style={{ color: "#b91c1c", fontWeight: 750 }}>удалить</span>
            </label>
            <input
              id="deck-delete-confirm"
              className="su-input"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={confirmWord}
              onChange={(event) => setConfirmWord(event.target.value)}
              placeholder="удалить"
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="su-btn su-btn-outline" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button
              type="button"
              disabled={!canSubmit || busy}
              onClick={handleConfirm}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: "var(--r-md)",
                fontSize: 14,
                fontWeight: 700,
                border: "none",
                cursor: !canSubmit || busy ? "not-allowed" : "pointer",
                opacity: !canSubmit || busy ? 0.55 : 1,
                background: "#b91c1c",
                color: "#ffffff",
              }}
            >
              {busy ? "Удаляем…" : "Удалить навсегда"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const toolbarCardStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 18,
  flexWrap: "wrap",
  padding: "16px 18px",
  boxShadow: "var(--sh-sm)",
};

const viewToggle = {
  display: "flex",
  gap: 4,
  padding: 3,
  background: "var(--surface)",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--line)",
};

const iconButton = (active) => ({
  width: 30,
  height: 30,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "calc(var(--r-md) - 3px)",
  background: active ? "var(--surface-2)" : "transparent",
  color: active ? "var(--ink)" : "var(--ink-3)",
  boxShadow: active ? "var(--sh-sm)" : "none",
});

const presentationStyleChip = {
  padding: "6px 10px",
  borderRadius: 999,
  background: "var(--surface-2)",
  color: "var(--ink-2)",
  fontSize: 11,
  fontFamily: "var(--font-sans)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const deckCardStyle = {
  overflow: "hidden",
  textAlign: "left",
  padding: 0,
  transition: "all 200ms var(--ease)",
  background: "var(--surface)",
  boxShadow: "var(--sh-sm)",
};

function plural(count, one, few, many) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
