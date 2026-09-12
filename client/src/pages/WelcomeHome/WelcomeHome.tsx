import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { SeoHead, buildOrganizationJsonLd } from "../../features/seo";
import AppLink from "../../components/AppLink";
import content from "./welcomeHome.content.json";
import styles from "./WelcomeHome.module.css";

const ROTATE_MS = 2800;

function BrandMark() {
  return (
    <svg
      className={styles.brandMark}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#95BF47"
        d="M8.2 7.4c.3-1.2 1.2-1.5 2.2-1.2l14.1 4.1c1 .3 1.4 1.3 1 2.2L19.8 26c-.4 1-1.5 1.4-2.4.9L5.8 19.6c-1-.5-1.2-1.7-.7-2.6L8.2 7.4Z"
      />
      <path
        fill="#5E8E3E"
        d="M11.2 8.8c.15-.55.7-.8 1.2-.55l10.4 4.7c.5.22.7.8.45 1.25l-4.8 9.1c-.25.5-.85.7-1.3.4L7.9 17.3c-.5-.28-.6-.9-.3-1.35l3.6-7.15Z"
      />
    </svg>
  );
}

export default function WelcomeHome() {
  const c = content;
  const reduceMotion = useReducedMotion();
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setPhraseIndex((i) => (i + 1) % c.hero.rotating.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [c.hero.rotating.length, reduceMotion]);

  const closeMenu = () => setMenuOpen(false);
  const phrase = c.hero.rotating[phraseIndex];

  return (
    <div className={styles.page}>
      <SeoHead
        title={c.seo.title}
        description={c.seo.description}
        path="/"
        image={c.hero.image}
        jsonLdId="platform-home"
        jsonLd={buildOrganizationJsonLd({
          name: c.brand,
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : "https://retailcosmos.com",
          description: c.seo.description,
        })}
      />

      <section className={styles.hero}>
        <div
          className={styles.heroBg}
          style={{ backgroundImage: `url(${c.hero.image})` }}
        />
        <div className={styles.heroScrim} />

        <header className={styles.nav}>
          <div className={styles.navInner}>
            <Link to="/" className={styles.brand} onClick={closeMenu}>
              <BrandMark />
              <span>retail cosmos</span>
            </Link>
            <nav className={styles.navLinks} aria-label="Primary">
              {c.nav.links.map((link) => (
                <AppLink key={link.href} to={link.href} className={styles.navLink}>
                  {link.label}
                </AppLink>
              ))}
            </nav>
            <div className={styles.navActions}>
              <AppLink to={c.nav.signIn.href} className={styles.navGhost}>
                {c.nav.signIn.label}
              </AppLink>
              <AppLink to={c.nav.primaryCta.href} className={styles.btnWhite}>
                {c.nav.primaryCta.label}
              </AppLink>
              <button
                type="button"
                className={styles.menuBtn}
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
          <div
            className={`${styles.mobilePanel} ${menuOpen ? styles.mobilePanelOpen : ""}`}
          >
            {c.nav.links.map((link) => (
              <AppLink key={link.href} to={link.href} onClick={closeMenu}>
                {link.label}
              </AppLink>
            ))}
            <AppLink to={c.nav.signIn.href} onClick={closeMenu}>
              {c.nav.signIn.label}
            </AppLink>
            <AppLink
              to={c.nav.primaryCta.href}
              className={styles.btnWhite}
              onClick={closeMenu}
            >
              {c.nav.primaryCta.label}
            </AppLink>
          </div>
        </header>

        <div className={styles.heroCopy}>
          <h1 className={styles.heroTitle}>
            <span>{c.hero.prefix}</span>
            <span className={styles.heroRotate} aria-live="polite">
              <AnimatePresence mode="wait">
                <motion.span
                  key={phrase}
                  initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? undefined : { opacity: 0, y: -12 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  style={{ display: "block" }}
                >
                  {phrase}
                </motion.span>
              </AnimatePresence>
            </span>
          </h1>
          <p className={styles.heroLead}>{c.hero.lead}</p>
          <div className={styles.heroCtas}>
            <AppLink to={c.hero.primaryCta.href} className={styles.btnWhite}>
              {c.hero.primaryCta.label}
            </AppLink>
            <AppLink to={c.hero.secondaryCta.href} className={styles.btnGhost}>
              {c.hero.secondaryCta.label}
            </AppLink>
          </div>
        </div>
      </section>

      <section className={styles.bandBlack} id={c.stores.id}>
        <div className={styles.wrap}>
          <h2 className={styles.everywhereTitle}>
            <span>{c.stores.titleWhite}</span>{" "}
            <span className={styles.muted}>{c.stores.titleGray}</span>
          </h2>
          <div className={styles.everywhereGrid}>
            {c.stores.tiles.map((tile) => (
              <AppLink
                key={tile.brand}
                to={tile.href}
                className={`${styles.tile} ${styles.tileStore} ${styles.tileLink}`}
              >
                <img src={tile.image} alt="" />
                <div className={styles.storeBrand}>{tile.brand}</div>
              </AppLink>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bandBlack} id={c.studio.id}>
        <div className={styles.wrap}>
          <div className={styles.studioHead}>
            <h2>{c.studio.title}</h2>
            <p>{c.studio.lead}</p>
            <AppLink to={c.studio.cta.href} className={styles.btnWhite}>
              {c.studio.cta.label}
            </AppLink>
          </div>
          <div className={styles.studioFrame}>
            <img src={c.studio.image} alt="Store layout studio" />
          </div>
        </div>
      </section>

      <section className={styles.bandForest} id={c.features.id}>
        <div className={styles.wrap}>
          <div className={styles.channelGrid}>
            {c.features.cards.map((card) => (
              <article key={card.title} className={styles.channelCard}>
                <div className={styles.channelVisual}>
                  <img src={card.image} alt="" />
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bandBlack} id={c.stories.id}>
        <div className={styles.wrap}>
          <h2 className={styles.sectionTitleLeft}>{c.stories.title}</h2>
          <div className={styles.storyGrid}>
            {c.stories.items.map((item) => (
              <article key={item.title} className={styles.storyCard}>
                <img src={item.image} alt="" />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.bandBlack} id={c.build.id}>
        <div className={styles.wrap}>
          <h2 className={styles.sectionTitleLeft}>{c.build.title}</h2>
          <ol className={styles.steps}>
            {c.build.steps.map((step) => (
              <li key={step.n}>
                <span>{step.n}</span>
                {step.title}
              </li>
            ))}
          </ol>
          <AppLink to={c.build.cta.href} className={styles.btnWhite}>
            {c.build.cta.label}
          </AppLink>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <div className={styles.footerGrid}>
            {c.footer.columns.map((col) => (
              <div key={col.title}>
                <h4>{col.title}</h4>
                {col.links.map((link) => (
                  <AppLink key={link.href + link.label} to={link.href}>
                    {link.label}
                  </AppLink>
                ))}
              </div>
            ))}
          </div>
          <p className={styles.footerLegal}>{c.footer.legal}</p>
        </div>
      </footer>
    </div>
  );
}
