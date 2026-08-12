import React, { useState } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import styles from './ProductCard.module.css';

export default function ProductCard({ product, onToggleWishlist, onQuickAdd }) {
  const {
    id,
    image,
    images,
    brand,
    title,
    price,
    originalPrice,
    currency = 'Rs.',
    badge,
    rating,
    sizes,
    wishlisted = false,
  } = product;

  const gallery = images && images.length > 0 ? images : image ? [image] : [];
  const hasGallery = gallery.length > 1;

  const [isWishlisted, setIsWishlisted] = useState(wishlisted);

  const [prevEl, setPrevEl] = useState(null);
  const [nextEl, setNextEl] = useState(null);
  const [paginationEl, setPaginationEl] = useState(null);

  const discountPercent =
    originalPrice && price
      ? Math.round(((originalPrice - price) / originalPrice) * 100)
      : null;

  const handleWishlistClick = () => {
    setIsWishlisted((w) => !w);
    onToggleWishlist?.(id, !isWishlisted);
  };

  return (
    <article className={styles.card}>
      <div className={styles.imageWrapper}>
        {hasGallery ? (
          <Swiper
            modules={[Navigation, Pagination, Autoplay]}
            speed={500}
            loop
            nested
            autoplay={{ delay: 2600, disableOnInteraction: false, pauseOnMouseEnter: true }}
            pagination={{ el: paginationEl, clickable: true, bulletClass: styles.dot, bulletActiveClass: styles.dotActive }}
            navigation={{ prevEl, nextEl }}
            className={styles.imageSwiper}
          >
            {gallery.map((src, i) => (
              <SwiperSlide key={i}>
                <div className={styles.imageZoom}>
                  <img
                    src={src}
                    alt={`${title} — view ${i + 1}`}
                    className={styles.image}
                    loading="lazy"
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        ) : (
          gallery[0] && (
            <div className={styles.imageZoom}>
              <img src={gallery[0]} alt={title} className={styles.image} loading="lazy" />
            </div>
          )
        )}

        {hasGallery && <div className={styles.imageFade} aria-hidden="true" />}

        {hasGallery && (
          <>
            <button
              ref={setPrevEl}
              type="button"
              className={`${styles.navArrow} ${styles.navArrowLeft}`}
              onClick={(e) => e.stopPropagation()}
              aria-label="Previous image"
            >
              <ArrowIcon direction="left" />
            </button>
            <button
              ref={setNextEl}
              type="button"
              className={`${styles.navArrow} ${styles.navArrowRight}`}
              onClick={(e) => e.stopPropagation()}
              aria-label="Next image"
            >
              <ArrowIcon direction="right" />
            </button>
            <div
              ref={setPaginationEl}
              className={styles.dots}
              onClick={(e) => e.stopPropagation()}
            />
          </>
        )}

        {badge && (
          <span className={`${styles.badge} ${styles[`badge_${badge.variant || 'new'}`]}`}>
            {badge.label}
          </span>
        )}

        <button
          type="button"
          className={`${styles.wishlistButton} ${isWishlisted ? styles.wishlistActive : ''}`}
          onClick={handleWishlistClick}
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={isWishlisted}
        >
          <HeartIcon filled={isWishlisted} />
        </button>

        {rating && (
          <span className={styles.ratingOverlay}>
            {rating.value}
            <StarIcon />
            <span className={styles.ratingDivider} />
            {rating.count}
          </span>
        )}

        <button
          type="button"
          className={styles.quickAdd}
          onClick={(e) => {
            e.stopPropagation();
            onQuickAdd?.(id);
          }}
        >
          <BagIcon />
          Quick Add
        </button>
      </div>

      <div className={styles.info}>
        {brand && <h3 className={styles.brand}>{brand}</h3>}
        {title && <p className={styles.title}>{title}</p>}
        {sizes && <p className={styles.sizes}>Sizes: {sizes}</p>}

        <div className={styles.priceRow}>
          <span className={styles.price}>
            {currency} {price}
          </span>
          {originalPrice && (
            <span className={styles.originalPrice}>
              {currency} {originalPrice}
            </span>
          )}
          {discountPercent !== null && (
            <span className={styles.discountPill}>{discountPercent}% OFF</span>
          )}
        </div>
      </div>
    </article>
  );
}

function HeartIcon({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? 'currentColor' : 'none'} aria-hidden="true">
      <path
        d="M12 20s-7-4.35-9.5-8.5C.7 8 2 4.5 5.5 4c2-.3 3.7.7 4.5 2.1C10.8 4.7 12.5 3.7 14.5 4c3.5.5 4.8 4 3 7.5C19 15.65 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.9 6.4 7 .7-5.3 4.7 1.6 6.9L12 17l-6.2 3.7 1.6-6.9-5.3-4.7 7-.7L12 2z" />
    </svg>
  );
}

function ArrowIcon({ direction = 'right' }) {
  const rotate = direction === 'left' ? 'rotate(180deg)' : 'none';
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ transform: rotate }} aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 8h12l1 12H5L6 8z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}