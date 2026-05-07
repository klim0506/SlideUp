import raw from "../../../shared/plan_limits.json";

/** Canonical limits from shared/plan_limits.json — edit that file to sync landing + backend. */
export const planLimits = raw.plans;

export function pdfExportsLabel(monthly) {
  if (monthly === null) return null;
  if (monthly === 1) return "1 PDF-экспорт в месяц";
  return `${monthly} PDF-экспортов в месяц`;
}

export function freeLandingFeatureItems() {
  const f = planLimits.free;
  return [
    `${f.monthly_slides} слайдов в месяц`,
    "Просмотр в браузере",
    pdfExportsLabel(f.pdf_exports_per_month),
    `${f.base_style_presets} базовых стиля`,
  ];
}

export function studentLandingFeatureItems() {
  const s = planLimits.student;
  const styles =
    s.style_presets_total != null ? `Все ${s.style_presets_total} стилей` : "Все стили";
  return [`${s.monthly_slides} слайдов в месяц`, "PDF и PPTX без лимита", styles, "Без водяного знака"];
}

export function studentUsageSlidesSummary() {
  return `${planLimits.student.monthly_slides} слайдов в месяц`;
}
