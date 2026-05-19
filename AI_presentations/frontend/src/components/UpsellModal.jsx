import { useMemo, useState } from "react";
import { Icon } from "@/lib/design";
import { apiJson, navigate } from "@/lib/api";
import { planLimits } from "@/lib/planLimits";

const planOffers = {
  student: {
    plan: "student",
    title: "Student",
    monthly: "490 ₽/мес",
    yearly: "4 469 ₽/год",
    monthlyHint: `${planLimits.student.monthly_slides} слайдов в месяц`,
    benefits: ["Больше слайдов каждый месяц", "Все готовые стили", "PDF и PPTX без лимита", "Без водяного знака"],
  },
  pro: {
    plan: "pro",
    title: "Pro",
    monthly: "1 390 ₽/мес",
    yearly: "12 677 ₽/год",
    monthlyHint: "безлимитные слайды",
    benefits: ["Безлимитные слайды", "Своя тема и цвета", "Публичные ссылки", "PDF и PPTX без лимита"],
  },
};

const slidePacks = [
  { id: "pack_50", label: "50 слайдов", price: "99 ₽" },
  { id: "pack_150", label: "150 слайдов", price: "249 ₽" },
  { id: "pack_500", label: "500 слайдов", price: "690 ₽" },
];

const copyByReason = {
  insufficient_slides: {
    icon: "credit",
    title: "Не хватает слайдов для этой генерации",
    body: ({ requested, available, missing }) =>
      `Нужно ${requested || "несколько"} слайдов, сейчас доступно ${available ?? 0}. Не хватает ${missing ?? "ещё нескольких"}.`,
    plan: "student",
    showPacks: true,
    primary: "Выбрать подписку",
  },
  pdf_limit: {
    icon: "download",
    title: "PDF-экспорт закончился на этом тарифе",
    body: () => "На Student и Pro можно скачивать PDF без месячного лимита.",
    plan: "student",
    primary: "Перейти на Student",
  },
  style_locked: {
    icon: "palette",
    title: "Этот стиль доступен на Student",
    body: () => "Student открывает все готовые стили для учебных, личных и регулярных рабочих презентаций.",
    plan: "student",
    primary: "Открыть стили",
  },
  custom_theme: {
    icon: "palette",
    title: "Своя тема доступна на Pro",
    body: () => "Pro нужен для фирменных цветов, публичных ссылок и командной бизнес-работы.",
    plan: "pro",
    primary: "Перейти на Pro",
  },
  hide_watermark: {
    icon: "sparkles",
    title: "Без водяного знака — на Student",
    body: () => "Student и Pro позволяют экспортировать и показывать презентации без водяного знака.",
    plan: "student",
    primary: "Убрать водяной знак",
  },
  share_link: {
    icon: "share",
    title: "Публичные ссылки доступны на Pro",
    body: () => "Pro подходит для бизнес-презентаций, когда нужно быстро отправить ссылку клиенту или команде.",
    plan: "pro",
    primary: "Включить Pro",
  },
  general: {
    icon: "sparkles",
    title: "Выберите тариф для этой задачи",
    body: () => "Student закрывает регулярную работу, Pro — бизнес-сценарии без лимитов.",
    plan: "student",
    primary: "Выбрать тариф",
  },
};

function UpsellModal({ open, onClose, reason = "general", context = {}, onReduceSlides }) {
  const [period, setPeriod] = useState("yearly");
  const [loadingOffer, setLoadingOffer] = useState("");
  const [error, setError] = useState("");
  const copy = copyByReason[reason] || copyByReason.general;
  const selectedPlanKey = copy.plan || "student";
  const selectedOffer = planOffers[selectedPlanKey] || planOffers.student;
  const body = useMemo(() => copy.body(context || {}), [copy, context]);

  if (!open) return null;

  async function handlePayment(payload, id) {
    setError("");
    setLoadingOffer(id);
    try {
      const data = await apiJson("/api/billing/yookassa/pay/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.location.href = data.confirmation_url;
    } catch (err) {
      setError(err.message || "Платёж сейчас не создался — попробуйте чуть позже.");
      setLoadingOffer("");
    }
  }

  const price = selectedOffer[period];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(20,19,15,.55)", padding: 20 }}>
      <div className="su-card upsell-pro-modal" style={{ width: "min(760px, 94vw)", padding: 24, boxShadow: "var(--sh-lg)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent)", flexShrink: 0 }}>
              <Icon name={copy.icon} size={20} stroke={2} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{copy.title}</h2>
              <p style={{ margin: "8px 0 0", color: "var(--ink-2)", fontSize: 15, lineHeight: 1.45 }}>{body}</p>
            </div>
          </div>
          <button aria-label="Закрыть" onClick={onClose} style={{ color: "var(--ink-3)", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="x" size={17} />
          </button>
        </div>

        <div className="upsell-pro-grid" style={{ display: "grid", gridTemplateColumns: copy.showPacks ? "minmax(0, 1fr) minmax(280px, .9fr)" : "1fr", gap: 18, alignItems: "stretch" }}>
          <div style={{ display: "grid", gap: 14 }}>
            <div style={{ padding: 4, display: "inline-grid", gridTemplateColumns: "1fr 1fr", gap: 4, borderRadius: "var(--r-md)", background: "var(--surface-2)", border: "1px solid var(--line)", maxWidth: 260 }}>
              {[
                ["monthly", "Месяц"],
                ["yearly", "Год"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  style={{
                    minHeight: 40,
                    borderRadius: "calc(var(--r-md) - 4px)",
                    background: period === value ? "var(--surface)" : "transparent",
                    color: period === value ? "var(--ink)" : "var(--ink-2)",
                    boxShadow: period === value ? "var(--sh-sm)" : "none",
                    fontWeight: 750,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ padding: 20, border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "baseline" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 780 }}>{selectedOffer.title}</div>
                  <div style={{ marginTop: 4, color: "var(--ink-3)", fontSize: 13 }}>{selectedOffer.monthlyHint}</div>
                </div>
                <div style={{ color: "var(--accent)", fontSize: 26, fontWeight: 780, letterSpacing: "-0.03em" }}>{price}</div>
              </div>
              <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                {selectedOffer.benefits.map((benefit) => (
                  <div key={benefit} style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--ink-2)", fontSize: 14 }}>
                    <Icon name="check" size={14} stroke={2.2} style={{ color: "var(--accent)" }} />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
              <button
                className="su-btn su-btn-accent"
                disabled={Boolean(loadingOffer)}
                onClick={() => handlePayment({ plan: selectedOffer.plan, billing_period: period }, `${selectedOffer.plan}_${period}`)}
                style={{ width: "100%", minHeight: 48, fontSize: 15, fontWeight: 750, marginTop: 18 }}
              >
                {loadingOffer ? "Открываем оплату..." : copy.primary}
                {!loadingOffer ? <Icon name="arrow-right" size={16} /> : null}
              </button>
              {onReduceSlides && Number(context?.available) > 0 ? (
                <button type="button" className="su-btn su-btn-outline" onClick={() => onReduceSlides(Number(context.available))} style={{ width: "100%", minHeight: 44, marginTop: 10 }}>
                  Уменьшить до {context.available} слайдов
                </button>
              ) : null}
            </div>
          </div>

          {copy.showPacks ? (
            <div style={{ padding: 18, border: "1px solid var(--line)", borderRadius: "var(--r-lg)", background: "var(--surface)" }}>
              <div style={{ fontSize: 16, fontWeight: 760 }}>Нужны только слайды?</div>
              <p style={{ margin: "6px 0 14px", color: "var(--ink-3)", fontSize: 13, lineHeight: 1.45 }}>
                Разовый пакет сохраняется, пока вы не потратите слайды. Показываем его только для таких случаев.
              </p>
              <div style={{ display: "grid", gap: 9 }}>
                {slidePacks.map((pack) => (
                  <button
                    key={pack.id}
                    type="button"
                    className="su-card"
                    disabled={Boolean(loadingOffer)}
                    onClick={() => handlePayment({ pack: pack.id }, pack.id)}
                    style={{ padding: 13, textAlign: "left", display: "flex", justifyContent: "space-between", gap: 12, opacity: loadingOffer === pack.id ? 0.6 : 1 }}
                  >
                    <span style={{ fontWeight: 750 }}>{pack.label}</span>
                    <span style={{ color: "var(--accent)", fontWeight: 780 }}>{pack.price}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {error ? <p className="su-user-hint" style={{ margin: "14px 0 0" }}>{error}</p> : null}
      </div>
    </div>
  );
}

export default UpsellModal;
