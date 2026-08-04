import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay, Keyboard } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import styles from './HeroSlider.module.css';

/**
 * Pass an array of slide objects as `slides`. Each slide shape:
 * {
 *   eyebrow: 'NEW ERA OF DESIGN',
 *   titlePlain: 'Futuristic Essentials for the',
 *   titleAccent: 'Modern Life.',
 *   description: '...',
 *   primaryCta: { label: 'Shop the Collection', href: '#' },
 *   secondaryCta: { label: 'View Lookbook', href: '#' },
 *   stats: [
 *     { value: '12k+', label: 'Happy Clients' },
 *     { value: '4.9/5', label: 'Rating', stars: 5 },
 *   ],
 *   image: 'https://...',
 *   badge: { eyebrow: 'LIMITED EDITION', title: 'Quantum Series X', price: '$1,299' },
 * }
 */
export default function HeroSlider({ slides = [], autoPlay = true, interval = 2000, announcement }) {
  if (slides.length === 0) return null;

  return (
    <section className={styles.wrapper}>
      {announcement && <div className={styles.announcementBar}>{announcement}</div>}

      <Swiper
        modules={[Navigation, Pagination, Autoplay, Keyboard]}
        navigation={{
          prevEl: `.${styles.arrowLeft}`,
          nextEl: `.${styles.arrowRight}`,
        }}
        pagination={{
          el: `.${styles.dots}`,
          clickable: true,
          bulletClass: styles.dot,
          bulletActiveClass: styles.dotActive,
        }}
        autoplay={
          autoPlay
            ? { delay: interval, disableOnInteraction: false, pauseOnMouseEnter: true }
            : false
        }
        keyboard={{ enabled: true }}
        loop={slides.length > 1}
        speed={550}
        className={styles.viewport}
      >
        {slides.map((slide, i) => (
          <SwiperSlide key={i}>
            <Slide slide={slide} />
          </SwiperSlide>
        ))}

        {slides.length > 1 && (
          <>
            <button type="button" className={`${styles.arrow} ${styles.arrowLeft}`} aria-label="Previous slide">
              <ArrowIcon direction="left" />
            </button>
            <button type="button" className={`${styles.arrow} ${styles.arrowRight}`} aria-label="Next slide">
              <ArrowIcon direction="right" />
            </button>
            <div className={styles.dots} />
          </>
        )}
      </Swiper>
    </section>
  );
}

function Slide({ slide }) {
  const {
    eyebrow,
    titlePlain,
    titleAccent,
    description,
    primaryCta,
    secondaryCta,
    stats = [],
    image,
    badge,
  } = slide;

  return (
    <div className={styles.slide}>
      <div className={styles.copyColumn}>
        {eyebrow && <span className={styles.eyebrow}>{eyebrow}</span>}

        <h1 className={styles.title}>
          {titlePlain} <em className={styles.titleAccent}>{titleAccent}</em>
        </h1>

        {description && <p className={styles.description}>{description}</p>}

        <div className={styles.ctaRow}>
          {primaryCta && (
            <a href={primaryCta.href || '#'} className={styles.primaryCta}>
              {primaryCta.label}
              <ArrowIcon direction="right" small />
            </a>
          )}
          {secondaryCta && (
            <a href={secondaryCta.href || '#'} className={styles.secondaryCta}>
              {secondaryCta.label}
            </a>
          )}
        </div>

        {stats.length > 0 && (
          <div className={styles.statsRow}>
            {stats.map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <span className={styles.statDivider} />}
                <div className={styles.stat}>
                  <span className={styles.statValue}>{stat.value}</span>
                  <span className={styles.statLabel}>
                    {stat.label}
                    {stat.stars ? <Stars count={stat.stars} /> : null}
                  </span>
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className={styles.imageColumn}>
        <div className={styles.imageCard}>
          {image && <img src={image} alt={badge?.title || ''} className={styles.image} />}
          {badge && (
            <div className={styles.imageBadge}>
              <div>
                <span className={styles.badgeEyebrow}>{badge.eyebrow}</span>
                <span className={styles.badgeTitle}>{badge.title}</span>
              </div>
              {badge.price && <span className={styles.badgePrice}>{badge.price}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stars({ count }) {
  return (
    <span className={styles.stars} aria-hidden="true">
      {'★'.repeat(count)}
    </span>
  );
}

function ArrowIcon({ direction = 'right', small = false }) {
  const size = small ? 14 : 18;
  const rotate = direction === 'left' ? 'rotate(180deg)' : 'none';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ transform: rotate }}
      aria-hidden="true"
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}