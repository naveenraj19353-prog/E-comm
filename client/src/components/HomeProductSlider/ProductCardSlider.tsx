import { useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, FreeMode, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import ProductCard from "./ProductCard";
import styles from "./ProductCardSlider.module.css";
import type { Product } from "../../features/products/types";
interface ProductCardSliderProps {
    title: string;
    products?: Product[];
    onToggleWishlist?: (productId: string, isAdding: boolean) => void;
    isWishlisted?: (productId: string) => boolean;
    onQuickAdd?: (productId: string, variantId: string, color: string, size: string) => void;
    slidesPerView?: number;
}
export default function ProductCardSlider({ title, products = [], onToggleWishlist, onQuickAdd, slidesPerView, }: ProductCardSliderProps) {
    const prevRef = useRef<HTMLButtonElement | null>(null);
    const nextRef = useRef<HTMLButtonElement | null>(null);
    if (products.length === 0) {
        return null;
    }
    const defaultBreakpoints = {
        0: {
            slidesPerView: 1.08,
            spaceBetween: 12,
        },
        640: {
            slidesPerView: 2,
            spaceBetween: 14,
        },
        900: {
            slidesPerView: 2.5,
            spaceBetween: 16,
        },
        1024: {
            slidesPerView: 3,
            spaceBetween: 16,
        },
        1280: {
            slidesPerView: 4,
            spaceBetween: 18,
        },
    };
    return (<section className={styles.section}>
      <div className={styles.header}>
        {title && <h2 className={styles.title}>{title}</h2>}
        <div className={styles.arrows}>
          <button ref={prevRef} type="button" className={styles.arrowButton} aria-label="Scroll left">
            <ArrowIcon direction="left"/>
          </button>
          <button ref={nextRef} type="button" className={styles.arrowButton} aria-label="Scroll right">
            <ArrowIcon direction="right"/>
          </button>
        </div>
      </div>
      <Swiper modules={[Navigation, FreeMode, Autoplay]} onBeforeInit={(swiper) => {
            const navigation = swiper.params.navigation;
            if (navigation && typeof navigation !== "boolean") {
                navigation.prevEl = prevRef.current;
                navigation.nextEl = nextRef.current;
            }
        }} freeMode={{
            enabled: true,
            momentum: true,
        }} slidesPerView={slidesPerView || "auto"} spaceBetween={16} breakpoints={slidesPerView ? undefined : defaultBreakpoints} className={styles.swiper} autoplay={{
            delay: 2600,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        }}>
        {products.map((product) => (<SwiperSlide key={product._id} className={styles.slide}>
            <ProductCard product={product} onWishlist={(productId, isAdding) => {
                onToggleWishlist?.(productId, isAdding);
            }} onAddToCart={(productId, variantId, color, size) => {
                onQuickAdd?.(productId, variantId, color, size);
            }}/>
          </SwiperSlide>))}
      </Swiper>
    </section>);
}
function ArrowIcon({ direction = "right" }: {
    direction?: "left" | "right";
}) {
    const rotate = direction === "left" ? "rotate(180deg)" : "none";
    return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{
            transform: rotate,
        }} aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
