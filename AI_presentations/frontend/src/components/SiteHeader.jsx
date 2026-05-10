import { useState } from "react";
import { Icon } from "@/lib/design";
import { LEGAL } from "@/lib/legal";
import { createEmptyPresentationAndOpen, getAccessToken, navigate } from "@/lib/api";

function scrollToLandingSection(elementId) {
  const run = () => document.getElementById(elementId)?.scrollIntoView({ behavior: "smooth" });
  if (window.location.pathname !== "/") {
    navigate("/");
    window.setTimeout(run, 120);
  } else {
    run();
  }
}

/** Маркетинговая шапка лендинга: одинаковые левая/центр/правая колонки на главной и юридических страницах. */
export default function SiteHeader({ user, onLogin }) {
  const [createBusy, setCreateBusy] = useState(false);

  const goCreate = async () => {
    if (createBusy) return;
    if (!getAccessToken()) {
      if (window.location.pathname !== "/") {
        navigate("/");
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 120);
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    setCreateBusy(true);
    try {
      await createEmptyPresentationAndOpen();
    } catch {
      setCreateBusy(false);
    }
  };

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "18px max(24px, 5vw)",
        position: "sticky",
        top: 0,
        background: "rgba(247,251,255,.86)",
        backdropFilter: "blur(14px)",
        zIndex: 50,
        borderBottom: "1px solid rgba(220,232,245,.76)",
      }}
    >
      <button type="button" onClick={() => navigate("/")} style={{ display: "flex", alignItems: "center", gap: 12, padding: 0 }}>
        <Icon name="logo" size={26} stroke={2.2} style={{ color: "var(--accent)" }} />
        <span style={{ fontSize: 22, fontWeight: 750, letterSpacing: "-0.01em", color: "var(--ink)" }}>{LEGAL.brand}</span>
      </button>

      <nav className="site-header-nav" aria-label="Разделы лендинга">
        <a
          className="site-header-nav__link"
          href="/#about"
          onClick={(e) => {
            e.preventDefault();
            scrollToLandingSection("about");
          }}
        >
          О нас
        </a>
        <a
          className="site-header-nav__link"
          href="/#how"
          onClick={(e) => {
            e.preventDefault();
            scrollToLandingSection("how");
          }}
        >
          Как работает
        </a>
        <a
          className="site-header-nav__link"
          href="/#pricing"
          onClick={(e) => {
            e.preventDefault();
            scrollToLandingSection("pricing");
          }}
        >
          Тарифы
        </a>
      </nav>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {user ? (
          <button type="button" className="su-btn su-btn-ghost" style={{ fontSize: 15 }} onClick={() => navigate("/dashboard")}>
            <Icon name="doc" size={14} /> Мои презентации
          </button>
        ) : (
          <button
            type="button"
            className="su-btn su-btn-ghost"
            onClick={onLogin}
            style={{ fontSize: 15, textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            Войти
          </button>
        )}
        <button type="button" className="su-btn su-btn-accent" style={{ fontSize: 15 }} onClick={goCreate} disabled={createBusy}>
          {createBusy ? "Создаём…" : "Создать презентацию"}
        </button>
      </div>
    </header>
  );
}
