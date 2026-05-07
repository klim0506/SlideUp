import { Icon } from "@/lib/design";
import { DOCUMENT_LINKS, INTERNAL_LINKS, LEGAL, SOCIAL_LINKS } from "@/lib/legal";
import { navigate } from "@/lib/api";

function handleInternalLink(event, href) {
  if (!href.startsWith("/")) return;

  event.preventDefault();
  const [path, hash] = href.split("#");
  navigate(path || "/");
  if (hash) {
    window.requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function FooterLink({ href, children }) {
  return (
    <a href={href} onClick={(event) => handleInternalLink(event, href)} className="su-footer-link">
      {children}
    </a>
  );
}

export default function SiteFooter() {
  return (
    <footer className="su-footer">
      <div className="su-footer-main">
        <div className="su-footer-brand">
          <button onClick={() => navigate("/")} className="su-footer-logo">
            <Icon name="logo" size={18} style={{ color: "var(--accent)" }} />
            <span>{LEGAL.brand}</span>
          </button>
          <p>
            Быстрее превращайте идеи в сильные презентации: фокусируйтесь на
            смысле и решениях, а структуру, текст и оформление доверьте SlideUp.
          </p>
          <div className="su-footer-socials" aria-label="Социальные сети">
            {SOCIAL_LINKS.map((link) => (
              <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className="su-footer-social">
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="su-footer-columns">
          <FooterColumn title="Разделы" links={INTERNAL_LINKS} />
          <FooterColumn title="Документы" links={DOCUMENT_LINKS} />
          <div>
            <h2 className="su-footer-heading">Контакты</h2>
            <div className="su-footer-contact">
              <span>{LEGAL.shortEntityName}</span>
              <span>ИНН {LEGAL.inn}</span>
              <span>ОГРН/ОГРНИП {LEGAL.ogrn}</span>
              <a href={`mailto:${LEGAL.supportEmail}`}>{LEGAL.supportEmail}</a>
              <span>{LEGAL.workTime}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="su-footer-bottom">
        <span>© 2026 {LEGAL.brand}. Все права защищены.</span>
        <span>
          Информация на сайте не является публичной офертой, кроме условий, прямо названных
          публичной офертой.
        </span>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h2 className="su-footer-heading">{title}</h2>
      <nav className="su-footer-nav" aria-label={title}>
        {links.map((link) => (
          <FooterLink key={link.href} href={link.href}>
            {link.label}
          </FooterLink>
        ))}
      </nav>
    </div>
  );
}
