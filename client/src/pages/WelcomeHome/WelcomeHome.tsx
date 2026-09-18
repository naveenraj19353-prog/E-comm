import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  Boxes,
  Building2,
  Camera,
  Heart,
  Menu,
  Network,
  Play,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Volume2,
  VolumeX,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import { SeoHead, buildOrganizationJsonLd } from "../../features/seo";
import AppLink from "../../components/AppLink";
import content from "./welcomeHome.content.json";
import styles from "./WelcomeHome.module.css";

const ROTATE_MS = 2800;
const BANNER_MS = 4500;

const ORBIT_ICONS: Record<string, ReactNode> = {
  store: <ShoppingBag size={18} strokeWidth={1.75} />,
  network: <Network size={18} strokeWidth={1.75} />,
  pos: <Store size={18} strokeWidth={1.75} />,
  truck: <Truck size={18} strokeWidth={1.75} />,
  users: <Users size={18} strokeWidth={1.75} />,
  chart: <BarChart3 size={18} strokeWidth={1.75} />,
  wallet: <Wallet size={18} strokeWidth={1.75} />,
  social: <Camera size={18} strokeWidth={1.75} />,
  market: <Boxes size={18} strokeWidth={1.75} />,
};

const TRUST_ICONS: Record<string, ReactNode> = {
  building: <Building2 size={18} strokeWidth={1.75} />,
  zap: <Zap size={18} strokeWidth={1.75} />,
  heart: <Heart size={18} strokeWidth={1.75} />,
};

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
  const [bannerIndex, setBannerIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [introMuted, setIntroMuted] = useState(true);
  const [walkMuted, setWalkMuted] = useState(true);
  const [studioMuted, setStudioMuted] = useState(true);
  const walkthroughRef = useRef<HTMLVideoElement>(null);
  const studioVideoRef = useRef<HTMLVideoElement>(null);
  const introVideoRef = useRef<HTMLVideoElement>(null);

  const banners =
    c.hero.images && c.hero.images.length > 0
      ? c.hero.images
      : [c.hero.image];

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

  useEffect(() => {
    const videos = [
      introVideoRef.current,
      walkthroughRef.current,
      studioVideoRef.current,
    ].filter((el): el is HTMLVideoElement => Boolean(el));

    if (videos.length === 0) return;

    const muteAll = () => {
      videos.forEach((video) => {
        video.muted = true;
      });
      setIntroMuted(true);
      setWalkMuted(true);
      setStudioMuted(true);
    };

    const playMuted = (video: HTMLVideoElement) => {
      video.muted = true;
      video.defaultMuted = true;
      if (reduceMotion) {
        video.pause();
        return;
      }
      void video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = entry.target as HTMLVideoElement;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.4) {
            playMuted(video);
          } else {
            video.muted = true;
            video.pause();
            if (video === introVideoRef.current) setIntroMuted(true);
            if (video === walkthroughRef.current) setWalkMuted(true);
            if (video === studioVideoRef.current) setStudioMuted(true);
          }
        });
      },
      { threshold: [0, 0.4, 0.65], rootMargin: "0px 0px -8% 0px" },
    );

    videos.forEach((video) => {
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      observer.observe(video);
    });

    let scrollTimer = 0;
    const onScroll = () => {
      muteAll();
      window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        videos.forEach((video) => {
          const rect = video.getBoundingClientRect();
          const visible =
            rect.top < window.innerHeight * 0.85 &&
            rect.bottom > window.innerHeight * 0.15;
          if (visible) playMuted(video);
        });
      }, 140);
    };

    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(scrollTimer);
    };
  }, [reduceMotion]);

  const toggleVideoMute = (
    video: HTMLVideoElement | null,
    muted: boolean,
    setMuted: (value: boolean) => void,
  ) => {
    if (!video) return;
    const nextMuted = !muted;
    video.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      video.volume = 1;
      void video.play().catch(() => {});
    }
  };

  const closeMenu = () => setMenuOpen(false);
  const phrase = c.hero.rotating[phraseIndex];
  const activeBanner = banners[bannerIndex] || c.hero.image;

  return (
    <div className={styles.page}>
      <SeoHead
        title={c.seo.title}
        description={c.seo.description}
        path="/"
        image={activeBanner}
        jsonLdId="platform-home"
        jsonLd={buildOrganizationJsonLd({
          name: c.brand,
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : import.meta.env.VITE_PUBLIC_SITE_URL ||
                "https://app.retailcosmos.com",
          description: c.seo.description,
        })}
      />

      <header className={`${styles.nav} ${menuOpen ? styles.navOpen : ""}`}>
        <div className={styles.navInner}>
          <Link to="/" className={styles.brand} onClick={closeMenu}>
            <BrandMark />
            <span>Retail Cosmos</span>
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
            <AppLink
              to={c.nav.primaryCta.href}
              className={`${styles.btnWhite} ${styles.navCta}`}
            >
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

      <section className={styles.hero}>
        <div className={styles.heroBanner}>
          <Swiper
            className={styles.heroSwiper}
            modules={[Autoplay, Pagination]}
            slidesPerView={1}
            speed={700}
            loop={banners.length > 1}
            allowTouchMove
            autoplay={
              reduceMotion || banners.length < 2
                ? false
                : {
                    delay: BANNER_MS,
                    disableOnInteraction: false,
                    pauseOnMouseEnter: true,
                  }
            }
            pagination={
              banners.length > 1
                ? {
                    clickable: true,
                    bulletClass: styles.heroBullet,
                    bulletActiveClass: styles.heroBulletActive,
                  }
                : false
            }
            onSlideChange={(swiper) => setBannerIndex(swiper.realIndex)}
          >
            {banners.map((src, i) => (
              <SwiperSlide key={src} className={styles.heroSlide}>
                <img
                  className={styles.heroSlideImg}
                  src={src}
                  alt={`Retail Cosmos storefront banner ${i + 1}`}
                  loading={i < 2 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : i === 1 ? "low" : "auto"}
                  decoding={i === 0 ? "sync" : "async"}
                  draggable={false}
                />
              </SwiperSlide>
            ))}
          </Swiper>
          <div className={styles.heroScrim} aria-hidden />
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
        </div>
      </section>

      <section className={styles.introLoop} id={c.introLoop.id}>
        <div className={styles.wrap}>
          <div className={styles.introLoopHead}>
            <p className={styles.introLoopEyebrow}>{c.introLoop.eyebrow}</p>
            <h2 className={styles.introLoopTitle}>
              <span>{c.introLoop.title}</span>
              <span className={styles.introLoopTitleAccent}>
                {c.introLoop.titleAccent}
              </span>
            </h2>
            <p className={styles.introLoopLead}>{c.introLoop.lead}</p>
          </div>

          <div className={styles.introLoopFrame}>
            <video
              ref={introVideoRef}
              className={styles.introLoopVideo}
              src={c.introLoop.src}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              controls
              aria-label={c.introLoop.ariaLabel}
            />
            <button
              type="button"
              className={styles.introLoopSoundBtn}
              onClick={() =>
                toggleVideoMute(introVideoRef.current, introMuted, setIntroMuted)
              }
              aria-pressed={!introMuted}
              aria-label={
                introMuted ? c.introLoop.unmuteLabel : c.introLoop.muteLabel
              }
            >
              {introMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span>
                {introMuted ? c.introLoop.unmuteLabel : c.introLoop.muteLabel}
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className={styles.platform} id={c.platform.id}>
        <div className={`${styles.wrap} ${styles.platformGrid}`}>
          <div className={styles.platformCopy}>
            <p className={styles.platformEyebrow}>{c.platform.eyebrow}</p>
            <h2 className={styles.platformTitle}>
              <span>{c.platform.titleLine1}</span>
              <span className={styles.platformTitleAccent}>
                {c.platform.titleLine2}
              </span>
            </h2>
            <p className={styles.platformLead}>{c.platform.lead}</p>
            <div className={styles.platformCtas}>
              <AppLink
                to={c.platform.primaryCta.href}
                className={styles.btnPlatform}
              >
                {c.platform.primaryCta.label} <ArrowRight size={16} />
              </AppLink>
              <AppLink
                to={c.platform.secondaryCta.href}
                className={styles.btnPlatformGhost}
              >
                <Play size={14} fill="currentColor" />
                {c.platform.secondaryCta.label}
              </AppLink>
            </div>
            <ul className={styles.platformTrust}>
              {c.platform.trust.map((item) => (
                <li key={item.label}>
                  <span className={styles.platformTrustIcon}>
                    {TRUST_ICONS[item.icon]}
                  </span>
                  {item.label}
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.orbitWrap} aria-label="Retail Cosmos channels">
            <p className={styles.orbitNote}>{c.platform.orbitNote}</p>
            <div className={styles.orbitRing} aria-hidden />
            <div className={styles.orbitCore}>
              <strong>{c.platform.orbitCenter.title}</strong>
              <span>{c.platform.orbitCenter.subtitle}</span>
            </div>
            {c.platform.orbit.map((node, i) => (
              <div
                key={node.label}
                className={styles.orbitNode}
                style={{ ["--i" as string]: i }}
              >
                <span className={styles.orbitNodeIcon}>
                  {ORBIT_ICONS[node.icon]}
                </span>
                <span className={styles.orbitNodeLabel}>{node.label}</span>
              </div>
            ))}
          </div>
        </div>
        <p className={styles.platformFooterLine}>{c.platform.footerLine}</p>
      </section>

      <section className={styles.videoSection} id={c.video.id}>
        <div className={styles.wrap}>
          <div className={styles.videoHead}>
            <p className={styles.videoEyebrow}>{c.video.eyebrow}</p>
            <h2 className={styles.videoTitle}>
              <span>{c.video.title}</span>
              <span className={styles.videoTitleAccent}>
                {c.video.titleAccent}
              </span>
            </h2>
            <p className={styles.videoLead}>{c.video.lead}</p>
          </div>

          <div className={styles.videoStage}>
            <div className={styles.videoFrame}>
              <video
                ref={walkthroughRef}
                className={styles.videoPlayer}
                poster={c.video.poster}
                src={c.video.src}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                controls
              />
              <button
                type="button"
                className={styles.introLoopSoundBtn}
                onClick={() =>
                  toggleVideoMute(walkthroughRef.current, walkMuted, setWalkMuted)
                }
                aria-pressed={!walkMuted}
                aria-label={walkMuted ? "Turn sound on" : "Mute"}
              >
                {walkMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                <span>{walkMuted ? "Turn sound on" : "Mute"}</span>
              </button>
            </div>

            <ol className={styles.videoSteps}>
              {c.video.steps.map((step) => (
                <li key={step.num} className={styles.videoStep}>
                  <span className={styles.videoStepNum}>{step.num}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className={styles.bandBlack} id={c.studio.id}>
        <div className={styles.wrap}>
          <div className={styles.studioHead}>
            <h2>{c.studio.title}</h2>
            <p>{c.studio.lead}</p>
          </div>
          <div className={styles.studioFrame}>
            <video
              ref={studioVideoRef}
              className={styles.studioPlayer}
              poster={c.studio.poster}
              src={c.studio.src}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              controls
            />
            <button
              type="button"
              className={styles.introLoopSoundBtn}
              onClick={() =>
                toggleVideoMute(
                  studioVideoRef.current,
                  studioMuted,
                  setStudioMuted,
                )
              }
              aria-pressed={!studioMuted}
              aria-label={studioMuted ? "Turn sound on" : "Mute"}
            >
              {studioMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span>{studioMuted ? "Turn sound on" : "Mute"}</span>
            </button>
          </div>
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
