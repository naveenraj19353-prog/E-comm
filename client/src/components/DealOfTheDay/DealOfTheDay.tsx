import { useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import styles from "./DealOfTheDay.module.css";
import Countdown from "./Countdown";
import ProductCard from "../sliders/ProductSlider/ProductCard";
import type { Product } from "../../features/products/types";
interface DealOfTheDayProps {
  products: Product[];
  onToggleWishlist?: (id: string, wishlisted: boolean) => void;
  onQuickAdd?: (id: string) => void;
}
const DealOfTheDay = ({
  products,
  onToggleWishlist,
  onQuickAdd,
}: DealOfTheDayProps) => {
  const prevRef = useRef<HTMLButtonElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  if (!products.length) {
    return null;
  }
  return (
    <section className={styles.section}>
      <div className={styles.left}>
        <span className={styles.tag}>🔥 Limited Time</span>
        <h2>
          Deal
          <br />
          Of The Day
        </h2>
        <p>
          Grab your favourite products at unbeatable prices. Don't miss today's
          exclusive deals.
        </p>
        <Countdown />
        <button type="button" className={styles.button}>
          Shop Now
          <span>→</span>
        </button>
      </div>

      <div className={styles.right}>
        <div className={styles.sliderHeader}>
          <div>
            <span className={styles.eyebrow}>TODAY'S OFFERS</span>
            <h3>Don't Miss These Deals</h3>
          </div>
          <div className={styles.arrows}>
            <button
              ref={prevRef}
              type="button"
              className={styles.arrowButton}
              aria-label="Previous deal"
            >
              <ArrowIcon direction="left" />
            </button>
            <button
              ref={nextRef}
              type="button"
              className={styles.arrowButton}
              aria-label="Next deal"
            >
              <ArrowIcon direction="right" />
            </button>
          </div>
        </div>
        <Swiper
          modules={[Navigation, Autoplay]}
          spaceBetween={18}
          slidesPerView={1}
          loop={products.length > 2}
          autoplay={{
            delay: 3500,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
          }}
          // navigation={{
          //   prevEl: prevRef.current,
          //   nextEl: nextRef.current,
          // }}
          // onBeforeInit={(swiper) => {
          //   if (typeof swiper.params.navigation !== "boolean") {
          //     swiper.params.navigation.prevEl = prevRef.current;
          //     swiper.params.navigation.nextEl = nextRef.current;
          //   }
          // }}
          breakpoints={{
            600: {
              slidesPerView: 1.5,
            },
            768: {
              slidesPerView: 2,
            },
            1100: {
              slidesPerView: 2.5,
            },
            1350: {
              slidesPerView: 3,
            },
          }}
          className={styles.swiper}
        >
          {products.map((product) => (
            <SwiperSlide key={product._id}>
              <ProductCard
                product={product}
                onWishlist={
                  onToggleWishlist
                    ? (id) => onToggleWishlist(id, true)
                    : undefined
                }
                onAddToCart={onQuickAdd}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  );
};
function ArrowIcon({ direction = "right" }) {
  const rotate = direction === "left" ? "rotate(180deg)" : "none";
  return (
    <svg
      width="16"
      height="16"
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
export default DealOfTheDay;
