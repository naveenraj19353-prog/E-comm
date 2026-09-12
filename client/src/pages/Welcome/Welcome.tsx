import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Menu, X, Rocket, Shield, Store } from "lucide-react";
import styles from "./Welcome.module.css";
import {
  formatStorefrontHost,
} from "../../features/tenant/tenantHost";
import { usePublicTenants } from "../../features/tenant/api/publicTenants.api";
import { SeoHead, buildOrganizationJsonLd } from "../../features/seo";
import { welcomeContent } from "./welcomeContent";
import {
  // CUSTOMIZATION_GROUPS,
  STUDIO_SCREENSHOTS,
  getCustomizationStats,
} from "../../theme/customizationCatalog";
import AppLink from "../../components/AppLink";
import { TECH_ICONS } from "./techIcons";

const ease = [0.22, 1, 0.36, 1] as const;
const SWIPE_MS = 5000;
const customizationStats = getCustomizationStats();

const FALLBACK_PREVIEWS = [
  "/images/welcome/fashion-1.jpg",
  "/images/welcome/fashion-2.jpg",
  "/images/welcome/fashion-3.jpg",
  "/images/welcome/fashion-4.jpg",
];

type DemoTenant = {
  id: string;
  slug: string | null;
  label: string;
  category: string;
  url: string;
  theme: string;
  stock: string;
  data: string;
  accent: string;
  screen: string;
  products: string[];
};

function BrandMark() {
  return (
    <svg
      className={styles.brandMark}
      viewBox="0 0 32 32"
      aria-hidden
      focusable="false"
    >
      <defs>
        <linearGradient id="rcMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7c3aed" />
          <stop offset="100%" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <path
        fill="url(#rcMark)"
        d="M16 2.5 28 9.4v13.2L16 29.5 4 22.6V9.4L16 2.5Z"
      />
      <path
        fill="#fff"
        d="M16 8.2 22.8 12v8L16 23.8 9.2 20v-8L16 8.2Zm0 3.1L12.4 13.3v5.4L16 20.7l3.6-2v-5.4L16 11.3Z"
      />
    </svg>
  );
}

export default function Welcome() {
  const c = welcomeContent;
  const reduceMotion = useReducedMotion();
  const { data: apiTenants, isLoading: tenantsLoading } = usePublicTenants();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  const demoTenants = useMemo<DemoTenant[]>(() => {
    if (apiTenants && apiTenants.length > 0) {
      return apiTenants.map((tenant) => {
        const products =
          tenant.previewImages.length > 0
            ? tenant.previewImages
            : FALLBACK_PREVIEWS;
        const cover =
          tenant.coverImage ||
          tenant.logo ||
          products[0] ||
          "/images/welcome/demo-store.jpg";
        return {
          id: tenant.tenantId || tenant.slug,
          slug: tenant.slug,
          label: tenant.name.toUpperCase(),
          category: tenant.theme,
          url: formatStorefrontHost(tenant.slug),
          theme: tenant.theme,
          stock:
            tenant.productCount > 0
              ? `${tenant.productCount.toLocaleString()}+ Products`
              : "Catalog ready",
          data: tenant.dataIsolation || "Fully Isolated",
          accent: tenant.accent || "#7c3aed",
          screen: cover,
          products: products.slice(0, 4),
        };
      });
    }

    if (tenantsLoading) {
      return [];
    }

    return c.tenantSwitcher.tenants.map((tenant) => ({
      id: tenant.id,
      slug: tenant.slug,
      label: tenant.label,
      category: tenant.category,
      url: tenant.url,
      theme: tenant.theme,
      stock: tenant.stock,
      data: tenant.data,
      accent: tenant.accent,
      screen: tenant.screen,
      products: tenant.products,
    }));
  }, [apiTenants, c.tenantSwitcher.tenants, tenantsLoading]);

  useEffect(() => {
    if (reduceMotion || paused || demoTenants.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % demoTenants.length);
    }, SWIPE_MS);
    return () => window.clearInterval(timer);
  }, [demoTenants.length, paused, reduceMotion]);

  const safeIndex =
    demoTenants.length === 0
      ? 0
      : ((activeIndex % demoTenants.length) + demoTenants.length) %
        demoTenants.length;
  const activeTenant = demoTenants[safeIndex] ?? null;

  const openHref = activeTenant?.slug
    ? `/${activeTenant.slug}`
    : "/create-store";

  return (
    <div className={styles.page}>
      <SeoHead
        title={c.seo.title}
        description={c.seo.description}
        path="/welcome-alt"
        image="/images/welcome/fashion-hero.png"
        jsonLdId="platform"
        jsonLd={buildOrganizationJsonLd({
          name: c.brand,
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : "https://retailcosmos.com",
          description: c.seo.description,
        })}
      />

      <header className={styles.nav}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.navBrand} onClick={closeMenu}>
            <BrandMark />
            <span>RETAIL COSMOS</span>
          </Link>
          <nav className={styles.navLinks} aria-label="Primary">
            {c.nav.links.map((link) => (
              <AppLink key={link.href} to={link.href}>
                {link.label}
              </AppLink>
            ))}
          </nav>
          <div className={styles.navActions}>
            <AppLink to={c.nav.signIn.href} className={styles.navGhost}>
              {c.nav.signIn.label}
            </AppLink>
            <AppLink to={c.nav.primaryCta.href} className={styles.navSolid}>
              {c.nav.primaryCta.label}
            </AppLink>
            <button
              type="button"
              className={styles.menuToggle}
              aria-expanded={menuOpen}
              aria-controls="welcome-mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>

        <div
          id="welcome-mobile-menu"
          className={menuOpen ? styles.mobileMenuOpen : styles.mobileMenu}
          hidden={!menuOpen}
        >
          <nav className={styles.mobileNav} aria-label="Mobile">
            {c.nav.links.map((link) => (
              <AppLink
                key={link.href}
                to={link.href}
                className={styles.mobileNavLink}
                onClick={closeMenu}
              >
                {link.label}
              </AppLink>
            ))}
          </nav>
          <div className={styles.mobileActions}>
            <AppLink
              to={c.nav.signIn.href}
              className={styles.mobileGhost}
              onClick={closeMenu}
            >
              {c.nav.signIn.label}
            </AppLink>
            <AppLink
              to={c.nav.primaryCta.href}
              className={styles.mobileSolid}
              onClick={closeMenu}
            >
              {c.nav.primaryCta.label}
            </AppLink>
          </div>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroAtmosphere} aria-hidden />
        <div className={styles.heroInner}>
          <motion.div
            className={styles.heroCopy}
            initial={reduceMotion ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease }}
          >
            <h1>
              One Platform.
              <br />
              Every Store.
            </h1>
            <p>{c.hero.lead}</p>
            <div className={styles.heroCtas}>
              <AppLink to={c.hero.primaryCta.href} className={styles.ctaPrimary}>
                {c.hero.primaryCta.label}
              </AppLink>
              <AppLink to={c.hero.secondaryCta.href} className={styles.ctaSecondary}>
                {c.hero.secondaryCta.label}
              </AppLink>
            </div>
          </motion.div>

          <motion.div
            className={styles.heroDeviceWrap}
            initial={reduceMotion ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.65, delay: 0.08, ease }}
          >
            <div className={styles.heroGlow} aria-hidden />
            {c.hero.floaters.map((floater, index) => (
              <motion.figure
                key={floater.image}
                className={styles.floater}
                data-pos={floater.position}
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + index * 0.08, ease }}
              >
                <img src={floater.image} alt={floater.label} loading="lazy" />
                <figcaption>{floater.label}</figcaption>
              </motion.figure>
            ))}
            <div className={styles.tablet}>
              <div className={styles.tabletBezel}>
                <img
                  src={c.hero.tabletImage}
                  alt="ShopSphere fashion storefront on tablet"
                />
              </div>
            </div>
          </motion.div>
        </div>

        <div className={styles.heroRail} aria-label="Storefront imagery">
          {c.hero.rail.map((src) => (
            <img key={src} src={src} alt="" loading="lazy" />
          ))}
        </div>
      </section>

      <section
        className={styles.tenantDemo}
        id={c.tenantSwitcher.id}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setPaused(false);
          }
        }}
      >
        <p className={styles.eyebrow}>{c.tenantSwitcher.eyebrow}</p>
        <h2>{c.tenantSwitcher.title}</h2>
        <p className={styles.tenantLead}>{c.tenantSwitcher.lead}</p>

        <div className={styles.customStats}>
          <div>
            <strong>{customizationStats.total}+</strong>
            <span>Customization controls</span>
          </div>
          <div>
            <strong>{customizationStats.groups}</strong>
            <span>Studio panels</span>
          </div>
          <div>
            <strong>{customizationStats.layoutControls}</strong>
            <span>Layout settings</span>
          </div>
          <div>
            <strong>{customizationStats.presets}</strong>
            <span>Color presets</span>
          </div>
        </div>

        <div className={styles.studioShotGrid}>
          {STUDIO_SCREENSHOTS.map((shot) => (
            <figure key={shot.id} className={styles.studioShot}>
              <img src={shot.image} alt={shot.label} loading="lazy" />
              <figcaption>
                <strong>{shot.label}</strong>
                <span>{shot.caption}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        {/* <ul className={styles.customGroups}>
          {CUSTOMIZATION_GROUPS.map((group) => (
            <li key={group.id}>
              <strong>{group.title}</strong>
              <span>{group.lines.length} options</span>
            </li>
          ))}
        </ul> */}

        {tenantsLoading ? (
          <p className={styles.tenantStatus}>Loading live tenants…</p>
        ) : null}

        <div className={styles.tenantTabs} role="tablist">
          {demoTenants.map((tenant, index) => (
            <button
              key={tenant.id}
              type="button"
              role="tab"
              aria-selected={index === safeIndex}
              className={index === safeIndex ? styles.tabActive : styles.tab}
              onClick={() => setActiveIndex(index)}
            >
              {tenant.label}
              <span>| {tenant.category}</span>
            </button>
          ))}
        </div>

        {activeTenant ? (
          <div className={styles.tenantStage}>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTenant.id}
                className={styles.laptop}
                style={{ ["--tenant-accent" as string]: activeTenant.accent }}
                initial={reduceMotion ? false : { opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -24 }}
                transition={{ duration: 0.4, ease }}
              >
                <div className={styles.laptopLid}>
                  <div className={styles.laptopScreen}>
                    <div className={styles.storeChrome}>
                      <strong>{activeTenant.label.replaceAll("_", " ")}</strong>
                      <em>{activeTenant.theme}</em>
                    </div>
                    <img
                      className={styles.storeHero}
                      src={activeTenant.screen}
                      alt={`${activeTenant.label} storefront`}
                    />
                    <div className={styles.storeGrid}>
                      {activeTenant.products.map((src, index) => (
                        <img
                          key={`${activeTenant.id}-${src}-${index}`}
                          src={src}
                          alt=""
                          loading="lazy"
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className={styles.laptopBase} />
              </motion.div>
            </AnimatePresence>
            <aside className={styles.metaCard}>
              <div>
                <span>URL</span>
                <strong>{activeTenant.url}</strong>
              </div>
              <div>
                <span>Theme</span>
                <strong>{activeTenant.theme}</strong>
              </div>
              <div>
                <span>Stock</span>
                <strong>{activeTenant.stock}</strong>
              </div>
              <div>
                <span>Data</span>
                <strong>{activeTenant.data}</strong>
              </div>
              <div>
                <span>Studio</span>
                <strong>
                  {customizationStats.total}+ controls · {c.tenantSwitcher.studioLabel}
                </strong>
              </div>
              <Link to={openHref} className={styles.metaLink}>
                {activeTenant.slug ? "Open live store →" : "Launch your store →"}
              </Link>
            </aside>
          </div>
        ) : null}

        {demoTenants.length > 1 ? (
          <div className={styles.swipeDots}>
            {demoTenants.map((tenant, index) => (
              <button
                key={tenant.id}
                type="button"
                className={
                  index === safeIndex ? styles.swipeDotActive : styles.swipeDot
                }
                onClick={() => setActiveIndex(index)}
                aria-label={`Show ${tenant.label}`}
              />
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.platform} id={c.platformDiagram.id}>
        <h2>{c.platformDiagram.title}</h2>
        <div className={styles.platformDiagram}>
          <div className={styles.platformCore}>
            <strong>{c.platformDiagram.core.title}</strong>
            <div className={styles.corePills}>
              {c.platformDiagram.core.items.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>
          <div className={styles.platformLines} aria-hidden>
            {(demoTenants.length > 0
              ? demoTenants
              : c.platformDiagram.stores
            )
              .slice(0, 4)
              .map((_, index) => (
                <span key={index} />
              ))}
          </div>
          <ul className={styles.platformStores}>
            {(demoTenants.length > 0
              ? demoTenants.map((tenant) => ({
                  name: tenant.label.replaceAll("_", " "),
                  tag: tenant.theme,
                  live: Boolean(tenant.slug),
                  image: tenant.screen,
                  href: tenant.slug ? `/${tenant.slug}` : undefined,
                }))
              : c.platformDiagram.stores.map((store) => ({
                  name: store.name,
                  tag: store.tag,
                  live: store.live,
                  image: store.image,
                  href: undefined as string | undefined,
                }))
            ).map((store) => (
              <li key={store.name} data-live={store.live ? "true" : "false"}>
                {store.href ? (
                  <Link to={store.href} className={styles.platformStoreLink}>
                    <img src={store.image} alt="" loading="lazy" />
                    <strong>{store.name}</strong>
                    <span>{store.tag}</span>
                  </Link>
                ) : (
                  <>
                    <img src={store.image} alt="" loading="lazy" />
                    <strong>{store.name}</strong>
                    <span>{store.tag}</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.caption}>{c.platformDiagram.caption}</p>
      </section>

      <section className={styles.isolation} id={c.isolation.id}>
        <p className={styles.eyebrow}>{c.isolation.eyebrow}</p>
        <h2>{c.isolation.title}</h2>
        <div className={styles.isolationBoard}>
          <div className={styles.isolationTenants}>
            {c.isolation.tenants.map((tenant) => (
              <div
                key={tenant.name}
                className={styles.isolationTenant}
                data-tone={tenant.tone}
              >
                <strong>{tenant.name}</strong>
                <ul>
                  {tenant.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
            <div className={styles.lockBadge} aria-hidden>
              🔒
            </div>
          </div>
          <div className={styles.isolationArrow} aria-hidden />
          <div className={styles.sharedEngine}>
            <strong>{c.isolation.sharedTitle}</strong>
            <ul>
              {c.isolation.sharedItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className={styles.caption}>{c.isolation.promise}</p>
      </section>

      <section className={styles.roles} id={c.roles.id}>
        <h2>{c.roles.title}</h2>
        <ul className={styles.roleGrid}>
          {c.roles.items.map((role, index) => (
            <motion.li
              key={role.id}
              className={styles.roleCard}
              data-tone={role.tone}
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.25 }}
              transition={{ duration: 0.4, delay: index * 0.05, ease }}
            >
              <div className={styles.roleCopy}>
                <p className={styles.roleLabel}>{role.label}</p>
                <ol>
                  {role.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
              <div className={styles.roleDevice}>
                <img src={role.image} alt="" loading="lazy" />
              </div>
            </motion.li>
          ))}
        </ul>
      </section>

      <section className={styles.tech} id={c.tech.id}>
        <div className={styles.techHead}>
          <h2>{c.tech.title}</h2>
          <p>{c.tech.lead}</p>
        </div>
        <ul className={styles.techGrid}>
          {c.tech.items.map((item, index) => {
            const meta = TECH_ICONS[item.id];
            const Icon = meta?.Icon;
            return (
              <motion.li
                key={item.id}
                className={styles.techCard}
                style={
                  {
                    ["--tech-color" as string]: meta?.color ?? "#6366f1",
                    ["--tech-tint" as string]: meta?.tint ?? "#eef2ff",
                  }
                }
                initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.4, delay: index * 0.05, ease }}
              >
                <div className={styles.techIcon} aria-hidden>
                  {Icon ? <Icon size={28} /> : null}
                </div>
                <strong>{item.label}</strong>
                <em>{item.detail}</em>
                <span>{item.blurb}</span>
              </motion.li>
            );
          })}
        </ul>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerCta}>
          <div
            className={styles.footerCtaMedia}
            style={{ backgroundImage: `url(${c.footer.image})` }}
            aria-hidden
          />
          <div className={styles.footerCtaCopy}>
            <p className={styles.footerEyebrow}>{c.footer.tagline}</p>
            <h2>{c.footer.ctaTitle}</h2>
            <p>{c.footer.ctaLead}</p>
            <div className={styles.footerCtaActions}>
              <AppLink to="/create-store" className={styles.footerPrimary}>
                Launch a store
              </AppLink>
              <AppLink to="/shopsphere" className={styles.footerSecondary}>
                Open demo store
              </AppLink>
            </div>
          </div>
        </div>

        <div className={styles.footerLinks}>
          {c.footer.links.map((link) => {
            const Icon =
              link.id === "launch"
                ? Rocket
                : link.id === "admin"
                  ? Shield
                  : Store;
            return (
              <AppLink
                key={link.href}
                to={link.href}
                className={
                  link.tone === "primary"
                    ? styles.footerLinkPrimary
                    : styles.footerLinkCard
                }
              >
                <span className={styles.footerLinkIcon} aria-hidden>
                  <Icon size={18} />
                </span>
                <span>
                  <strong>{link.label}</strong>
                  <em>{link.detail}</em>
                </span>
              </AppLink>
            );
          })}
        </div>

        <div className={styles.footerBottom}>
          <div className={styles.footerBrand}>
            <BrandMark />
            <div>
              <strong>{c.footer.brand}</strong>
              <span>{c.footer.copyright}</span>
            </div>
          </div>
          <span className={styles.footerYear}>
            © {new Date().getFullYear()} Retail Cosmos
          </span>
        </div>
      </footer>
    </div>
  );
}
