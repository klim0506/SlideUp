import { useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import UpsellModal from "@/components/UpsellModal";
import { Icon } from "@/lib/design";
import { apiJson, getAccessToken, getMe, navigate } from "@/lib/api";

const DEFAULT_BG = "#f7fbff";
const DEFAULT_INK = "#0b1f3a";
const DEFAULT_ACCENT = "#2563eb";

function ColorPreview({ bg, ink, accent, size = 44 }) {
  return (
    <div
      style={{
        width: "100%",
        height: size,
        borderRadius: 8,
        overflow: "hidden",
        display: "flex",
        boxShadow: "0 0 0 1px rgba(15,31,58,.1)",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 3, background: bg }} />
      <div style={{ flex: 2, background: accent }} />
      <div style={{ flex: 1, background: ink }} />
    </div>
  );
}

function SchemeCard({ scheme, onSave, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scheme.name);
  const [bg, setBg] = useState(scheme.bg);
  const [ink, setInk] = useState(scheme.ink);
  const [accent, setAccent] = useState(scheme.accent);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    setName(scheme.name);
    setBg(scheme.bg);
    setInk(scheme.ink);
    setAccent(scheme.accent);
  }, [scheme]);

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(scheme.id, { name: name.trim() || "Без названия", bg, ink, accent });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setName(scheme.name);
    setBg(scheme.bg);
    setInk(scheme.ink);
    setAccent(scheme.accent);
    setEditing(false);
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <ColorPreview bg={editing ? bg : scheme.bg} ink={editing ? ink : scheme.ink} accent={editing ? accent : scheme.accent} />

      {editing ? (
        <input
          ref={nameRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          style={{
            fontSize: 14,
            fontWeight: 600,
            border: "none",
            borderBottom: "2px solid var(--accent)",
            outline: "none",
            background: "transparent",
            color: "var(--ink)",
            padding: "2px 0",
            width: "100%",
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
        />
      ) : (
        <div
          style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)", cursor: "pointer", lineHeight: 1.3 }}
          onClick={() => { setEditing(true); setTimeout(() => nameRef.current?.focus(), 0); }}
          title="Нажмите, чтобы переименовать"
        >
          {scheme.name}
        </div>
      )}

      {editing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { key: "bg", label: "Фон", value: bg, set: setBg },
            { key: "ink", label: "Текст", value: ink, set: setInk },
            { key: "accent", label: "Акцент", value: accent, set: setAccent },
          ].map(({ key, label, value, set }) => (
            <label
              key={key}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", gap: 10 }}
            >
              <span>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>{value}</span>
                <input
                  type="color"
                  value={value}
                  onChange={(e) => set(e.target.value)}
                  style={{ width: 36, height: 24, padding: 0, border: "1px solid var(--line)", borderRadius: 5, cursor: "pointer", background: "var(--surface)" }}
                />
              </div>
            </label>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        {editing ? (
          <>
            <button
              type="button"
              className="su-btn su-btn-accent"
              onClick={handleSave}
              disabled={saving}
              style={{ flex: 1, fontSize: 12 }}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </button>
            <button
              type="button"
              className="su-btn"
              onClick={handleCancel}
              style={{ fontSize: 12 }}
            >
              Отмена
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="su-btn"
              onClick={() => setEditing(true)}
              style={{ flex: 1, fontSize: 12 }}
            >
              Редактировать
            </button>
            <button
              type="button"
              className="su-btn"
              onClick={() => onDelete(scheme.id)}
              style={{ fontSize: 12, color: "var(--red, #dc2626)" }}
              title="Удалить схему"
            >
              <Icon name="trash-2" size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NewSchemeCard({ onCreate, onCancel }) {
  const [name, setName] = useState("Без названия");
  const [bg, setBg] = useState(DEFAULT_BG);
  const [ink, setInk] = useState(DEFAULT_INK);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      await onCreate({ name: name.trim() || "Без названия", bg, ink, accent });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "2px solid var(--accent)",
        borderRadius: 14,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <ColorPreview bg={bg} ink={ink} accent={accent} />

      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        placeholder="Название схемы"
        style={{
          fontSize: 14,
          fontWeight: 600,
          border: "none",
          borderBottom: "2px solid var(--accent)",
          outline: "none",
          background: "transparent",
          color: "var(--ink)",
          padding: "2px 0",
          width: "100%",
        }}
        onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onCancel(); }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { key: "bg", label: "Фон", value: bg, set: setBg },
          { key: "ink", label: "Текст", value: ink, set: setInk },
          { key: "accent", label: "Акцент", value: accent, set: setAccent },
        ].map(({ key, label, value, set }) => (
          <label
            key={key}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--ink-2)", gap: 10 }}
          >
            <span>{label}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--ink-3)" }}>{value}</span>
              <input
                type="color"
                value={value}
                onChange={(e) => set(e.target.value)}
                style={{ width: 36, height: 24, padding: 0, border: "1px solid var(--line)", borderRadius: 5, cursor: "pointer", background: "var(--surface)" }}
              />
            </div>
          </label>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          type="button"
          className="su-btn su-btn-accent"
          onClick={handleCreate}
          disabled={saving}
          style={{ flex: 1, fontSize: 12 }}
        >
          {saving ? "Создание…" : "Создать схему"}
        </button>
        <button
          type="button"
          className="su-btn"
          onClick={onCancel}
          style={{ fontSize: 12 }}
        >
          Отмена
        </button>
      </div>
    </div>
  );
}

export default function Personalization() {
  const [user, setUser] = useState(null);
  const [schemes, setSchemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const isPro = user?.plan === "pro";

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
    loadSchemes();
  }, []);

  async function loadSchemes() {
    if (!getAccessToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await apiJson("/api/color-schemes/");
      setSchemes(Array.isArray(data) ? data : (data.results ?? []));
    } catch (err) {
      setError(err.message || "Схемы сейчас не загрузились — обновите страницу чуть позже.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(payload) {
    const created = await apiJson("/api/color-schemes/", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSchemes((prev) => [created, ...prev]);
    setCreating(false);
  }

  async function handleSave(id, payload) {
    const updated = await apiJson(`/api/color-schemes/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    setSchemes((prev) => prev.map((s) => (s.id === id ? updated : s)));
  }

  async function handleDelete(id) {
    await apiJson(`/api/color-schemes/${id}/`, { method: "DELETE" });
    setSchemes((prev) => prev.filter((s) => s.id !== id));
    setDeleteConfirm(null);
  }

  function handleNewSchemeClick() {
    if (!isPro) {
      setUpsellOpen(true);
      return;
    }
    setCreating(true);
  }

  const fromParam = new URLSearchParams(window.location.search).get("from");
  const backUrl = fromParam ? `/presentation/${fromParam}` : "/presentation";

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--ink)" }}>
      <AppHeader user={user} onLogout={() => { navigate("/"); }} />

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 20px 60px" }}>
        {/* Breadcrumb + title row */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button
            type="button"
            className="su-btn"
            onClick={() => navigate(backUrl)}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
          >
            <Icon name="arrow-left" size={16} />
            {fromParam ? "К презентации" : "Дашборд"}
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 720, margin: 0, letterSpacing: "-0.02em" }}>
            Цветовые схемы
          </h1>
        </div>

        {!getAccessToken() ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--ink-2)", fontSize: 15 }}>
            Войдите в аккаунт, чтобы управлять схемами.
          </div>
        ) : (
          <>
            {/* Pro gate banner */}
            {user && !isPro && (
              <div
                style={{
                  background: "rgba(37,99,235,.07)",
                  border: "1px solid rgba(37,99,235,.2)",
                  borderRadius: 12,
                  padding: "14px 18px",
                  marginBottom: 24,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontWeight: 650, fontSize: 14 }}>Цветовые схемы — функция тарифа Pro</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>
                    Создавайте именованные палитры и применяйте их к любым презентациям.
                  </div>
                </div>
                <button
                  type="button"
                  className="su-btn su-btn-accent"
                  onClick={() => setUpsellOpen(true)}
                  style={{ fontSize: 13, flexShrink: 0 }}
                >
                  Перейти на Pro
                </button>
              </div>
            )}

            {/* Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
                {loading ? "Загрузка…" : `${schemes.length} ${schemeWord(schemes.length)}`}
              </div>
              <button
                type="button"
                className="su-btn su-btn-accent"
                onClick={handleNewSchemeClick}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}
              >
                <Icon name="plus" size={15} />
                Новая схема
              </button>
            </div>

            {error && <div className="su-user-hint" style={{ marginBottom: 16 }}>{error}</div>}

            {/* Scheme grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                gap: 16,
              }}
            >
              {creating && (
                <NewSchemeCard
                  onCreate={handleCreate}
                  onCancel={() => setCreating(false)}
                />
              )}
              {schemes.map((scheme) => (
                <SchemeCard
                  key={scheme.id}
                  scheme={scheme}
                  onSave={handleSave}
                  onDelete={(id) => setDeleteConfirm(id)}
                />
              ))}
              {!creating && !loading && schemes.length === 0 && (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    textAlign: "center",
                    padding: "60px 0",
                    color: "var(--ink-3)",
                    fontSize: 15,
                  }}
                >
                  Схем пока нет. Создайте первую!
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              padding: 28,
              maxWidth: 360,
              width: "calc(100% - 40px)",
              boxShadow: "0 20px 60px rgba(15,23,42,.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>Удалить схему?</div>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 20 }}>
              Это действие нельзя отменить. Схема будет удалена из всех мест, где она использовалась.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className="su-btn"
                onClick={() => setDeleteConfirm(null)}
                style={{ flex: 1 }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="su-btn su-btn-accent"
                onClick={() => handleDelete(deleteConfirm)}
                style={{ flex: 1, background: "var(--red, #dc2626)", border: "none" }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <UpsellModal open={upsellOpen} reason="custom_theme" onClose={() => setUpsellOpen(false)} />
    </div>
  );
}

function schemeWord(n) {
  if (n % 100 >= 11 && n % 100 <= 14) return "схем";
  const last = n % 10;
  if (last === 1) return "схема";
  if (last >= 2 && last <= 4) return "схемы";
  return "схем";
}
