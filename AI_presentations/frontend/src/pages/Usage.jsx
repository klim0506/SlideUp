import { useEffect, useMemo, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import AuthModal from "@/components/AuthModal";
import SiteFooter from "@/components/SiteFooter";
import { Icon } from "@/lib/design";
import { apiJson, createBlankPresentation, getAccessToken, getMe, navigate } from "@/lib/api";
import { studentUsageSlidesSummary } from "@/lib/planLimits";

const PACKS = [
  { id: "pack_50", label: "50 слайдов", price: "99 ₽", detail: "для одного проекта" },
  { id: "pack_150", label: "150 слайдов", price: "249 ₽", detail: "для серии встреч" },
  { id: "pack_500", label: "500 слайдов", price: "690 ₽", detail: "для активной команды" },
];

const PLANS = [
  {
    id: "student",
    title: "Student",
    monthly: "490 ₽",
    yearly: "4 469 ₽",
    slides: studentUsageSlidesSummary(),
    description: "Для учёбы, личных проектов и регулярных черновиков.",
  },
  {
    id: "pro",
    title: "Pro",
    monthly: "1 390 ₽",
    yearly: "12 677 ₽",
    slides: "Безлимитные слайды",
    description: "Для бизнеса: больше лимитов, публичные ссылки и спокойная работа с экспортом.",
  },
];

const DEMO_LOG = [
  { date: "2026-05-05", action_display: "Генерация", presentation_title: "Стратегия роста", slides_spent: 12 },
  { date: "2026-05-03", action_display: "Экспорт PDF", presentation_title: "Квартальный отчёт Q1", slides_spent: 0 },
  { date: "2026-05-01", action_display: "Правка слайда", presentation_title: "Онбординг команды", slides_spent: 1 },
];

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatPlan(plan, period) {
  if (!plan) return "Free";
  const planName = String(plan).charAt(0).toUpperCase() + String(plan).slice(1);
  if (period === "yearly") return `${planName}, год`;
  return `${planName}, месяц`;
}

export default function Usage() {
  const [usage, setUsage] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState("");
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(!getAccessToken());
  const [createBusy, setCreateBusy] = useState(false);
  const [period, setPeriod] = useState("yearly");

  const slidesPercent = useMemo(() => {
    if (!usage || usage.slides_limit == null) return 0;
    if (!usage.slides_limit) return 0;
    return Math.min(100, Math.round((usage.slides_used / usage.slides_limit) * 100));
  }, [usage]);

  const slidesLeft = usage?.slides_limit == null ? null : Math.max(usage.slides_limit - usage.slides_used, 0);
  const log = usage?.log?.length ? usage.log : DEMO_LOG;

  async function loadUsage() {
    if (!getAccessToken()) {
      setLoading(false);
      setAuthOpen(true);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [me, billing] = await Promise.all([getMe(), apiJson("/api/billing/usage/")]);
      setUser(me);
      setUsage(billing);
      setPeriod(billing.billing_period || "yearly");
    } catch (err) {
      if (err.status === 401) {
        setAuthOpen(true);
      } else {
        setError(err.message || "Данные по тарифу сейчас не подгрузились — обновите страницу чуть позже.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsage();
  }, []);

  async function createPresentation() {
    if (createBusy) return;
    setCreateBusy(true);
    setError("");
    try {
      const deck = await createBlankPresentation();
      navigate(`/presentation/${deck.id}`);
    } catch (err) {
      if (err.status === 401) setAuthOpen(true);
      else setError(err.message || "Не получилось создать презентацию — попробуйте ещё раз.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function createPayment(payload, paymentId) {
    setPaying(paymentId);
    setError("");
    try {
      const data = await apiJson("/api/billing/yookassa/pay/", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      window.location.href = data.confirmation_url;
    } catch (err) {
      setError(err.message || "Оплата сейчас не стартовала — попробуйте ещё раз через минуту.");
      setPaying("");
    }
  }

  return (
    <div className="su-page">
      <AppHeader user={user} active="usage" onLogout={() => navigate("/")} />

      <main className="su-container" style={{ padding: "34px 0 80px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "end", marginBottom: 26, flexWrap: "wrap" }}>
          <div>
            <div style={{ color: "var(--accent)", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Лимиты и тарифы</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(32px, 5vw, 54px)", lineHeight: 1, letterSpacing: "-0.04em", margin: 0 }}>
              Понятная оплата за готовые презентации
            </h1>
            <p style={{ color: "var(--ink-2)", maxWidth: 620, margin: "14px 0 0", fontSize: 17 }}>
              SlideUp считает слайды, показывает остаток и даёт выбрать: подписка на месяц, выгодная годовая оплата или разовый пакет.
            </p>
          </div>
          <button onClick={() => void createPresentation()} disabled={createBusy} className="su-btn su-btn-accent">
            <Icon name={createBusy ? "loader" : "plus"} size={15} /> {createBusy ? "Создаём..." : "Создать презентацию"}
          </button>
        </div>

        {error && <div className="su-user-hint" style={{ marginBottom: 20 }}>{error}</div>}

        {loading ? (
          <LoadingSkeleton />
        ) : (
          <>
            <section className="usage-stats">
              <StatCard label="Слайдов использовано" value={usage?.slides_used ?? "0"} sub={usage?.slides_limit == null ? "безлимит на Pro" : `из ${usage.slides_limit}`}>
                {usage?.slides_limit != null && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 6, background: "var(--surface-2)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${slidesPercent}%`, height: "100%", background: slidesPercent > 85 ? "#dc2626" : "var(--accent)", borderRadius: 99 }} />
                    </div>
                    <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 7 }}>Осталось {slidesLeft} слайдов</div>
                  </div>
                )}
              </StatCard>
              <StatCard label="PDF-экспорт" value={usage?.pdf_exports_used ?? "0"} sub={usage?.pdf_exports_limit == null ? "безлимит" : `из ${usage.pdf_exports_limit} в месяц`} />
              <StatCard label="Текущий план" value={formatPlan(usage?.plan, usage?.billing_period)} sub={usage?.current_period_end ? `до ${formatDate(usage.current_period_end)}` : "без активной подписки"} />
            </section>

            <section className="usage-layout">
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <Panel title="История действий" icon="history">
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--line)" }}>
                          {["Дата", "Действие", "Презентация", "Слайды"].map((heading, index) => (
                            <th key={heading} style={{ padding: "9px 10px", textAlign: index === 3 ? "right" : "left", color: "var(--ink-3)", fontWeight: 600, whiteSpace: "nowrap" }}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((entry, index) => (
                          <tr key={`${entry.presentation_title}-${index}`} style={{ borderBottom: index < log.length - 1 ? "1px solid var(--line)" : "none" }}>
                            <td style={{ padding: "11px 10px", color: "var(--ink-3)", whiteSpace: "nowrap" }}>{formatDate(entry.date)}</td>
                            <td style={{ padding: "11px 10px" }}>{entry.action_display}</td>
                            <td style={{ padding: "11px 10px", maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.presentation_title || "Без названия"}</td>
                            <td style={{ padding: "11px 10px", textAlign: "right", fontFamily: "var(--font-mono)" }}>{entry.slides_spent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="Разовые пакеты" icon="plus">
                  <div className="usage-packs">
                    {PACKS.map((pack) => (
                      <button
                        key={pack.id}
                        disabled={Boolean(paying)}
                        onClick={() => createPayment({ pack: pack.id }, pack.id)}
                        className="su-card"
                        style={{ padding: 16, textAlign: "left", opacity: paying === pack.id ? 0.6 : 1 }}
                      >
                        <div style={{ fontWeight: 750, fontSize: 15 }}>{pack.label}</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 760, letterSpacing: "-0.03em", color: "var(--accent)", marginTop: 6 }}>{pack.price}</div>
                        <div style={{ color: "var(--ink-3)", fontSize: 12 }}>{pack.detail}</div>
                        {paying === pack.id && <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 8 }}>Открываем оплату...</div>}
                      </button>
                    ))}
                  </div>
                </Panel>
              </div>

              <Panel title="Подписка" icon="credit">
                <div style={{ display: "inline-flex", padding: 3, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", marginBottom: 14 }}>
                  {[
                    ["monthly", "Месяц"],
                    ["yearly", "Год"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      onClick={() => setPeriod(value)}
                      style={{
                        padding: "7px 14px",
                        borderRadius: 9,
                        background: period === value ? "var(--surface)" : "transparent",
                        color: period === value ? "var(--ink)" : "var(--ink-3)",
                        boxShadow: period === value ? "var(--sh-sm)" : "none",
                        fontWeight: 650,
                        fontSize: 13,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {PLANS.map((plan) => (
                    <button
                      key={plan.id}
                      disabled={Boolean(paying)}
                      onClick={() => createPayment({ plan: plan.id, billing_period: period }, `${plan.id}_${period}`)}
                      className="su-card"
                      style={{ padding: 16, textAlign: "left", borderColor: plan.id === "pro" ? "var(--accent)" : "var(--line)", opacity: paying === `${plan.id}_${period}` ? 0.6 : 1 }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                        <div style={{ fontWeight: 760, fontSize: 16 }}>{plan.title}</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 780, color: "var(--accent)", letterSpacing: "-0.03em" }}>{plan[period]}</div>
                      </div>
                      <div style={{ color: "var(--ink-2)", fontSize: 13, marginTop: 8 }}>{plan.description}</div>
                      <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 8 }}>{plan.slides}</div>
                    </button>
                  ))}
                </div>

                {period === "yearly" && (
                  <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 12, background: "var(--accent-soft)", color: "var(--accent)", fontSize: 13, fontWeight: 650 }}>
                    Годовая оплата выгоднее на 24%.
                  </div>
                )}
              </Panel>
            </section>
          </>
        )}
      </main>

      <SiteFooter />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onSuccess={loadUsage} />
    </div>
  );
}

function StatCard({ label, value, sub, children }) {
  return (
    <div className="su-card" style={{ padding: 20 }}>
      <div style={{ color: "var(--ink-3)", fontFamily: "var(--font-mono)", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 650 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 36, lineHeight: 1, fontWeight: 760, letterSpacing: "-0.04em", marginTop: 10 }}>{value}</div>
      <div style={{ color: "var(--ink-3)", fontSize: 13, marginTop: 6 }}>{sub}</div>
      {children}
    </div>
  );
}

function Panel({ title, icon, children }) {
  return (
    <section className="su-card" style={{ overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 18px", borderBottom: "1px solid var(--line)" }}>
        <Icon name={icon} size={15} style={{ color: "var(--ink-3)" }} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 720 }}>{title}</h2>
      </div>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {[0, 1, 2].map((item) => (
        <div key={item} className="su-card" style={{ height: 120, padding: 20 }}>
          <div style={{ height: 10, width: "35%", background: "var(--line)", borderRadius: 99, marginBottom: 16 }} />
          <div style={{ height: 34, width: "55%", background: "var(--line)", borderRadius: 8 }} />
        </div>
      ))}
    </div>
  );
}
