import React, { useRef, useId } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, FreeMode, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import ProductCard from './ProductCard';
import styles from './ProductCardSlider.module.css';

/**
 * Generic product carousel. Pass any array of product objects (see ProductCard.jsx
 * for the shape) and it renders them as a horizontally scrollable, arrow-navigable row.
 *
 * <ProductCardSlider title="You may also like" products={products} />
 */
export default function ProductCardSlider({
  title,
  products = [],
  onToggleWishlist,
  slidesPerView,
}) {
  const uid = useId().replace(/:/g, '');
  const prevRef = useRef(null);
  const nextRef = useRef(null);
console.log("ProductCardSlider", products)
  if (products.length === 0) return null;

  const defaultBreakpoints = {
    0: { slidesPerView: 1, spaceBetween: 12 },
    560: { slidesPerView: 3, spaceBetween: 14 },
    900: { slidesPerView: 4.2, spaceBetween: 16 },
    1280: { slidesPerView: 4, spaceBetween: 18 },
  };

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <div className={styles.arrows}>
          <button
            ref={prevRef}
            type="button"
            className={styles.arrowButton}
            aria-label="Scroll left"
          >
            <ArrowIcon direction="left" />
          </button>
          <button
            ref={nextRef}
            type="button"
            className={styles.arrowButton}
            aria-label="Scroll right"
          >
            <ArrowIcon direction="right" />
          </button>
        </div>
      </div>

      <Swiper
        modules={[Navigation, FreeMode, Autoplay]}
        onBeforeInit={(swiper) => {
          swiper.params.navigation.prevEl = prevRef.current;
          swiper.params.navigation.nextEl = nextRef.current;
        }}
        navigation={{ prevEl: prevRef.current, nextEl: nextRef.current }}
        freeMode={{ enabled: true, momentum: true }}
        slidesPerView={slidesPerView || 'auto'}
        spaceBetween={16}
        breakpoints={slidesPerView ? undefined : defaultBreakpoints}
        className={styles.swiper}
        autoplay={{ delay: 2600, disableOnInteraction: false, pauseOnMouseEnter: true }}
      >
        {products.map((product) => (
          <SwiperSlide key={product.id ?? `${uid}-${product.title}`} className={styles.slide}>
            <ProductCard product={product} onToggleWishlist={onToggleWishlist} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
}

function ArrowIcon({ direction = 'right' }) {
  const rotate = direction === 'left' ? 'rotate(180deg)' : 'none';
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ transform: rotate }} aria-hidden="true">
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