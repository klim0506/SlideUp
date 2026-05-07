import { useEffect, useRef, useState } from "react";
import { Icon } from "@/lib/design";
import { GOOGLE_CLIENT_ID, login, loginWithGoogle, navigate, register } from "@/lib/api";

function AuthModal({ open, onClose, onSuccess }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const googleButtonRef = useRef(null);

  useEffect(() => {
    if (!open || !GOOGLE_CLIENT_ID) return undefined;

    let cancelled = false;
    setGoogleReady(false);

    function initializeGoogle() {
      if (cancelled || !window.google?.accounts?.id || !googleButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async ({ credential }) => {
          if (!credential) return;
          setError("");
          setLoading(true);
          try {
            await loginWithGoogle(credential);
            onSuccess?.();
            onClose?.();
          } catch (err) {
            setError(err.message || "Вход через Google сейчас не сработал — попробуйте ещё раз.");
          } finally {
            setLoading(false);
          }
        },
      });

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: "outline",
        size: "large",
        text: mode === "login" ? "signin_with" : "signup_with",
        shape: "pill",
        width: 392,
      });
      setGoogleReady(true);
    }

    if (window.google?.accounts?.id) {
      initializeGoogle();
      return () => {
        cancelled = true;
      };
    }

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing || document.createElement("script");

    function handleLoad() {
      initializeGoogle();
    }

    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", handleLoad);
    if (!existing) document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", handleLoad);
    };
  }, [mode, onClose, onSuccess, open]);

  if (!open) return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
      onSuccess?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Пароль или email не подошли — проверьте и попробуйте снова.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div onClick={onClose} style={{
      position: "fixed",
      inset: 0,
      background: "rgba(20,19,15,.55)",
      backdropFilter: "blur(4px)",
      zIndex: 100,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      animation: "fadeIn 200ms var(--ease) both",
    }}>
      <div onClick={(event) => event.stopPropagation()} style={{
        width: "min(440px, 92vw)",
        background: "var(--surface)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--sh-lg)",
        overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="logo" size={18} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 700, fontSize: 18, color: "var(--ink)", letterSpacing: "-0.02em" }}>
              {mode === "login" ? "Войти в SlideUp" : "Создать аккаунт"}
            </span>
          </div>
          <button onClick={onClose} aria-label="Закрыть" style={{ width: 32, height: 32, borderRadius: 999, color: "var(--ink-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          {GOOGLE_CLIENT_ID ? (
            <>
              <div
                ref={googleButtonRef}
                style={{
                  minHeight: 44,
                  display: "flex",
                  justifyContent: "center",
                  opacity: googleReady && !loading ? 1 : 0.72,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--ink-3)", fontSize: 12 }}>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
                <span>или по email</span>
                <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
              </div>
            </>
          ) : null}

          <div>
            <label style={labelStyle}>Email</label>
            <input className="su-input" type="email" placeholder="you@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Пароль</label>
            <input className="su-input" type="password" placeholder="Минимум 8 символов" value={password} onChange={(event) => setPassword(event.target.value)} />
          </div>

          {error ? <div className="su-user-hint">{error}</div> : null}

          <button type="submit" disabled={loading} className="su-btn su-btn-primary" style={{ justifyContent: "center", padding: 14, marginTop: 6, fontSize: 15, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Проверяем…" : mode === "login" ? "Войти" : "Зарегистрироваться"}
          </button>

          {mode === "register" ? (
            <div style={{ color: "var(--ink-3)", fontSize: 12, lineHeight: 1.55 }}>
              Регистрируясь, вы принимаете{" "}
              <LegalLink href="/legal/offer">публичную оферту</LegalLink>,{" "}
              <LegalLink href="/legal/privacy">политику обработки персональных данных</LegalLink>{" "}
              и даете <LegalLink href="/legal/consent">согласие на обработку персональных данных</LegalLink>.
            </div>
          ) : null}

          <div style={{ textAlign: "center", marginTop: 8, fontSize: 13, color: "var(--ink-3)" }}>
            {mode === "login" ? "Нет аккаунта? " : "Уже есть аккаунт? "}
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              style={{ color: "var(--accent)", fontWeight: 650 }}
            >
              {mode === "login" ? "Создать аккаунт" : "Войти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, color: "var(--ink-2)", marginBottom: 6, fontWeight: 650 };

function LegalLink({ href, children }) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault();
        navigate(href);
      }}
      style={{ color: "var(--accent)", fontWeight: 650 }}
    >
      {children}
    </a>
  );
}

export default AuthModal;
