export const LEGAL = {
  brand: "SlideUp",
  serviceUrl: import.meta.env.VITE_PUBLIC_SITE_URL || "https://slidegen.ru",
  entityName: import.meta.env.VITE_LEGAL_ENTITY_NAME || "ИП Щегольков Климентий Тимофеевич",
  shortEntityName: import.meta.env.VITE_LEGAL_SHORT_ENTITY_NAME || "ИП Щегольков К. Т.",
  inn: import.meta.env.VITE_LEGAL_INN || "973302503446",
  ogrn: import.meta.env.VITE_LEGAL_OGRN || "325774600369184",
  kpp: import.meta.env.VITE_LEGAL_KPP || "Укажите КПП, если применимо",
  legalAddress: import.meta.env.VITE_LEGAL_ADDRESS || "Укажите юридический адрес",
  postalAddress: import.meta.env.VITE_LEGAL_POSTAL_ADDRESS || "Укажите почтовый адрес",
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || "support@slidegen.ru",
  legalEmail: import.meta.env.VITE_LEGAL_EMAIL || "legal@slidegen.ru",
  phone: import.meta.env.VITE_LEGAL_PHONE || "Укажите телефон",
  workTime: import.meta.env.VITE_LEGAL_WORK_TIME || "Пн-Вс, 08:00-22:00 по Лондонскому времени",
  paymentProvider: import.meta.env.VITE_PAYMENT_PROVIDER || "ЮKassa",
  updatedAt: "6 мая 2026",
};

export const SOCIAL_LINKS = [
  { label: "Telegram", href: import.meta.env.VITE_SOCIAL_TELEGRAM || "https://t.me/slideup_app" },
  { label: "VK", href: import.meta.env.VITE_SOCIAL_VK || "https://vk.com/slideup_app" },
  { label: "YouTube", href: import.meta.env.VITE_SOCIAL_YOUTUBE || "https://www.youtube.com/@slideup_app" },
  { label: "Дзен", href: import.meta.env.VITE_SOCIAL_DZEN || "https://dzen.ru/slideup" },
];

export const INTERNAL_LINKS = [
  { label: "Главная", href: "/" },
  { label: "Примеры", href: "/#examples" },
  { label: "Как работает", href: "/#how" },
  { label: "Возможности", href: "/#features" },
  { label: "Тарифы", href: "/#pricing" },
  { label: "Кабинет", href: "/presentation" },
];

export const DOCUMENT_LINKS = [
  { label: "Публичная оферта", href: "/legal/offer" },
  { label: "Политика обработки ПДн", href: "/legal/privacy" },
  { label: "Согласие на обработку ПДн", href: "/legal/consent" },
  { label: "Оплата и кассовые чеки", href: "/legal/payment" },
  { label: "Возвраты и претензии", href: "/legal/refund" },
  { label: "Реквизиты", href: "/legal/requisites" },
];
