import { useRef } from "react";
import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/pagination";
import { isVideoSrc, listingSwiperSources, photoSources } from "../../utils/mediaSrc";
import ProductImage from "./ProductImage";
import styles from "./ProductCardMedia.module.css";

type ProductCardMediaProps = {
  sources: string[];
  alt: string;
  className?: string;
  mediaClassName?: string;
  loading?: "eager" | "lazy";
  variant?: "hover" | "swiper";
};

function playActiveVideos(swiper: SwiperType) {
  swiper.slides.forEach((slide) => {
    const video = slide.querySelector("video");
    if (!video) return;
    const active = slide.classList.contains("swiper-slide-active");
    video.muted = true;
    video.playsInline = true;
    if (active) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  });
}

export default function ProductCardMedia({
  sources,
  alt,
  className,
  mediaClassName,
  loading = "lazy",
  variant = "swiper",
}: ProductCardMediaProps) {
  const draggedRef = useRef(false);
  const pointerActiveRef = useRef(false);
  const pointerStartRef = useRef({ x: 0, y: 0 });

  if (variant === "swiper") {
    const slides = listingSwiperSources(sources);
    const many = slides.length > 1;
    if (!slides.length) {
      return (
        <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
          <div className={styles.empty}>No photo</div>
        </div>
      );
    }
    return (
      <div
        className={[styles.wrap, className].filter(Boolean).join(" ")}
        onPointerDown={(event) => {
          pointerActiveRef.current = true;
          draggedRef.current = false;
          pointerStartRef.current = { x: event.clientX, y: event.clientY };
          if (many) {
            event.stopPropagation();
          }
        }}
        onPointerMove={(event) => {
          if (!pointerActiveRef.current) {
            return;
          }
          const dx = event.clientX - pointerStartRef.current.x;
          const dy = event.clientY - pointerStartRef.current.y;
          if (Math.hypot(dx, dy) > 8) {
            draggedRef.current = true;
          }
        }}
        onPointerUp={() => {
          pointerActiveRef.current = false;
        }}
        onPointerCancel={() => {
          pointerActiveRef.current = false;
        }}
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (
            draggedRef.current ||
            target.closest(".swiper-pagination") ||
            target.classList.contains("swiper-pagination-bullet")
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <Swiper
          modules={[Pagination, Autoplay]}
          className={styles.swiper}
          slidesPerView={1}
          spaceBetween={0}
          loop={false}
          rewind={many}
          speed={420}
          nested
          observer
          observeParents
          watchOverflow
          simulateTouch
          allowTouchMove={many}
          touchStartPreventDefault={false}
          touchMoveStopPropagation
          autoplay={
            many
              ? {
                  delay: 2800,
                  disableOnInteraction: false,
                  pauseOnMouseEnter: true,
                }
              : false
          }
          pagination={many ? { clickable: true } : false}
          onSwiper={playActiveVideos}
          onSlideChange={playActiveVideos}
        >
          {slides.map((src, index) => (
            <SwiperSlide key={`${src}-${index}`} className={styles.slide}>
              <ProductImage
                src={src}
                alt={`${alt} ${index + 1}`}
                className={[styles.layer, mediaClassName].filter(Boolean).join(" ")}
                loading={index === 0 ? loading : "lazy"}
                autoPlay={isVideoSrc(src)}
                draggable={false}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    );
  }

  const photos = photoSources(sources);
  const first = photos[0] || "";
  const second = photos[1] || "";
  if (!first) {
    return (
      <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
        <div className={styles.empty}>No photo</div>
      </div>
    );
  }

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(" ")}>
      <ProductImage
        src={first}
        alt={alt}
        className={[styles.layer, mediaClassName].filter(Boolean).join(" ")}
        loading={loading}
        autoPlay={false}
      />
      {second && (
        <ProductImage
          src={second}
          alt=""
          className={[styles.layer, styles.secondary, mediaClassName]
            .filter(Boolean)
            .join(" ")}
          loading="lazy"
          autoPlay={false}
        />
      )}
    </div>
  );
}
