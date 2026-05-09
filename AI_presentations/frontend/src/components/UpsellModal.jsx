import { useState } from "react";
import { Icon } from "@/lib/design";
import { apiJson } from "@/lib/api";

const proOffers = {
  yearly: {
    id: "pro_yearly",
    label: "Год",
    badge: "Скидка 24%",
    title: "Pro на год",
    price: "12 677 ₽/год",
    monthlyHint: "от 1 060 ₽/мес",
    note: "Оплата раз в год, максимум выгоды.",
    payload: { plan: "pro", billing_period: "yearly" },
  },
  monthly: {
    id: "pro_monthly",
    label: "Месяц",
    title: "Pro на месяц",
    price: "1 390 ₽/мес",
    monthlyHint: "помесячная оплата",
    note: "Можно продлевать только когда нужен Pro.",
    payload: { plan: "pro", billing_period: "monthly" },
  },
};

const proBenefits = [
  "Безлимитные слайды",
  "Все стили презентаций",
  "Публичные ссылки",
  "PDF и PPTX без лимита",
  "Приоритетная генерация",
];

function UpsellModal({ open, onClose }) {
  const [period, setPeriod] = useState("yearly");
  const [loadingOffer, setLoadingOffer] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const selectedOffer = proOffers[period];

  async function handlePayment(offer) {
    setError("");
    setLoadingOffer(offer.id);
    try {
      const data = await apiJson("/api/billing/yookassa/pay/", {
        method: "POST",
        body: JSON.stringify(offer.payload),
      });
      window.location.href = data.confirmation_url;
    } catch (err) {
      setError(err.message || "Платёж сейчас не создался — попробуйте чуть позже.");
      setLoadingOffer("");
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,19,15,.55)", padding: 20 }}>
      <div className="su-card upsell-pro-modal" style={{ width: "min(720px, 94vw)", padding: 24, boxShadow: "var(--sh-lg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.02em" }}>Разблокируйте больше возможностей</h2>
            <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.45 }}>
              Оформите Pro, чтобы создавать презентации без лимитов, использовать все стили и свободно экспортировать результат.
            </p>
          </div>
          <button aria-label="Закрыть" onClick={onClose} style={{ color: "var(--ink-3)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="upsell-pro-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(260px, .95fr)", gap: 18, alignItems: "stretch" }}>
          <div style={{ padding: 20, borderRadius: "var(--r-lg)", background: "linear-gradient(155deg, color-mix(in srgb, var(--accent) 92%, white) 0%, #4f8df7 48%, var(--accent-deep) 100%)", color: "var(--accent-fg)", boxShadow: "0 20px 46px -24px rgba(37, 99, 235, 0.46)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, fontSize: 13, fontWeight: 750, opacity: 0.94 }}>
              <Icon name="sparkles" size={15} stroke={2} />
              Pro
            </div>
            <div style={{ fontSize: 38, fontWeight: 780, letterSpacing: "-0.04em", lineHeight: 1.06 }}>{selectedOffer.price}</div>
            <div style={{ marginTop: 6, fontSize: 14, opacity: 0.88 }}>{selectedOffer.monthlyHint}</div>
            <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.26)", display: "grid", gap: 10 }}>
              {proBenefits.map((benefit) => (
                <div key={benefit} style={{ display: "flex", gap: 9, alignItems: "center", fontSize: 14, lineHeight: 1.3 }}>
                  <Icon name="check" size={14} stroke={2.2} />
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ padding: 4, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, borderRadius: "var(--r-md)", background: "var(--surface-2)", border: "1px solid var(--line)" }}>
              {Object.entries(proOffers).map(([key, offer]) => {
                const active = period === key;
                return (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => setPeriod(key)}
                    aria-pressed={active}
                    style={{
                      minHeight: 48,
                      borderRadius: "calc(var(--r-md) - 4px)",
                      background: active ? "var(--surface)" : "transparent",
                      color: active ? "var(--ink)" : "var(--ink-2)",
                      boxShadow: active ? "var(--sh-sm)" : "none",
                      fontWeight: 750,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 7,
                    }}
                  >
                    <span>{offer.label}</span>
                    {offer.badge ? (
                      <span style={{ padding: "2px 7px", borderRadius: 999, background: "var(--accent)", color: "white", fontSize: 11, lineHeight: 1.4 }}>
                        {offer.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div style={{ flex: 1, padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
              <div style={{ fontSize: 17, fontWeight: 760, marginBottom: 7 }}>{selectedOffer.title}</div>
              <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.5 }}>{selectedOffer.note}</p>
              <div style={{ marginTop: 18, color: "var(--accent)", fontSize: 26, fontWeight: 780, letterSpacing: "-0.03em" }}>{selectedOffer.price}</div>
              <div style={{ marginTop: 4, color: "var(--ink-3)", fontSize: 13 }}>{selectedOffer.monthlyHint}</div>
            </div>

            <button
              className="su-btn su-btn-accent"
              disabled={Boolean(loadingOffer)}
              onClick={() => handlePayment(selectedOffer)}
              style={{ width: "100%", minHeight: 48, fontSize: 15, fontWeight: 750 }}
            >
              {loadingOffer ? "Открываем оплату..." : "Оформить Pro"}
              {!loadingOffer ? <Icon name="arrow-right" size={16} /> : null}
            </button>
          </div>
        </div>

        {error ? <p className="su-user-hint" style={{ margin: "14px 0 0" }}>{error}</p> : null}
      </div>
    </div>
  );
}

export default UpsellModal;
