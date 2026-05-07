import { useState } from "react";
import { Icon } from "@/lib/design";
import { LEGAL } from "@/lib/legal";
import { navigate } from "@/lib/api";

export function AppHeader({ user, onLogout, onLibrary, active }) {
  return (
    <header style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
      alignItems: "center",
      gap: 16,
      padding: "18px max(24px, 5vw)",
      borderBottom: "1px solid rgba(220,232,245,.76)",
      background: "rgba(247,251,255,.86)",
      backdropFilter: "blur(14px)",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <button type="button" onClick={onLibrary || (() => navigate("/dashboard"))} style={{ display: "flex", alignItems: "center", gap: 12, padding: 0, justifySelf: "start" }}>
        <Icon name="logo" size={26} stroke={2.2} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 22, fontWeight: 750, color: "var(--ink)", letterSpacing: "-0.01em" }}>{LEGAL.brand}</span>
      </button>

      <nav style={{ display: "flex", gap: 4, justifySelf: "center" }}>
        <NavTab active={active === "library"} onClick={onLibrary || (() => navigate("/dashboard"))} icon="doc" label="Презентации" />
      </nav>

      <div style={{ display: "flex", gap: 10, alignItems: "center", justifySelf: "end" }}>
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}

function NavTab({ active, onClick, icon, label }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "8px 14px",
      borderRadius: "var(--r-md)",
      color: active ? "var(--ink)" : "var(--ink-3)",
      background: active ? "var(--surface)" : "transparent",
      fontSize: 14,
      fontWeight: 600,
      boxShadow: active ? "var(--sh-sm)" : "none",
      border: active ? "1px solid var(--line)" : "1px solid transparent",
    }}>
      <Icon name={icon} size={14} /> {label}
    </button>
  );
}

function UserMenu({ user, onLogout }) {
  const [open, setOpen] = useState(false);
  const label = user?.email || "Аккаунт";
  const initials = label.split(/[\s@._-]/).filter(Boolean).map((part) => part[0]).slice(0, 2).join("").toUpperCase() || "SU";

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(!open)} title={label} style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        background: "var(--accent)",
        color: "var(--accent-fg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 13,
        fontWeight: 700,
      }}>
        {initials}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
          <div style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-md)",
            boxShadow: "var(--sh-md)",
            minWidth: 230,
            zIndex: 50,
            padding: 6,
          }}>
            <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)", marginBottom: 4 }}>
              <div style={{ fontWeight: 650, fontSize: 13 }}>Рабочий аккаунт</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</div>
            </div>
            <MenuRow icon="credit" label="Лимиты и тарифы" onClick={() => { setOpen(false); navigate("/usage"); }} />
            <MenuRow icon="doc" label="Мои презентации" onClick={() => { setOpen(false); navigate("/dashboard"); }} />
            <div style={{ height: 1, background: "var(--line)", margin: "4px 0" }} />
            <MenuRow icon="x" label="Выйти" onClick={() => { setOpen(false); onLogout?.(); }} />
          </div>
        </>
      )}
    </div>
  );
}

function MenuRow({ icon, label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "8px 10px",
        fontSize: 13,
        color: "var(--ink-2)",
        borderRadius: "var(--r-sm)",
        textAlign: "left",
        background: hover ? "var(--surface-2)" : "transparent",
      }}
    >
      <Icon name={icon} size={14} /> {label}
    </button>
  );
}
