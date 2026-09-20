import { Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/pagination";
import AppLink from "../AppLink";
import { isBannerVideoSrc } from "./bannerMedia";
import styles from "./BannerSlider.module.css";

export interface Banner {
  _id: string;
  tenantId: string;
  title?: string;
  subtitle?: string;
  description?: string;
  image: string;
  mobileImage?: string;
  mediaType?: "image" | "video" | string;
  buttonText?: string;
  link?: string;
  priority?: number;
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface BannerSliderProps {
  banners: Banner[];
}

function syncSlideMedia(swiper: SwiperType) {
  const active = swiper.slides[swiper.activeIndex];
  swiper.el.querySelectorAll("video").forEach((video) => {
    if (active?.contains(video)) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  });
  const activeVideo = active?.querySelector("video");
  if (activeVideo) {
    swiper.autoplay?.stop();
  } else {
    swiper.autoplay?.start();
  }
}

function BannerMedia({
  banner,
  index,
}: {
  banner: Banner;
  index: number;
}) {
  const desktopIsVideo = isBannerVideoSrc(banner.image, banner.mediaType);
  const mobileSrc = banner.mobileImage || banner.image;
  const mobileIsVideo = isBannerVideoSrc(mobileSrc, banner.mediaType);
  const showMobile = Boolean(banner.mobileImage);
  const hideDesktopOnMobile = showMobile && (desktopIsVideo || mobileIsVideo);
  const desktopClass = hideDesktopOnMobile ? styles.desktopOnly : undefined;

  return (
    <>
      {desktopIsVideo ? (
        <video
          className={`${styles.image} ${styles.video}${desktopClass ? ` ${desktopClass}` : ""}`}
          src={banner.image}
          autoPlay
          muted
          loop
          playsInline
          preload={index === 0 ? "auto" : "metadata"}
        />
      ) : (
        <picture className={desktopClass}>
          {banner.mobileImage && !mobileIsVideo && (
            <source media="(max-width: 768px)" srcSet={banner.mobileImage} />
          )}
          <img
            src={banner.image}
            alt={banner.title || "Banner"}
            className={styles.image}
            loading={index === 0 ? "eager" : "lazy"}
            fetchPriority={index === 0 ? "high" : "auto"}
            decoding="async"
          />
        </picture>
      )}
      {showMobile &&
        (mobileIsVideo ? (
          <video
            className={`${styles.image} ${styles.video} ${styles.mobileOnly}`}
            src={mobileSrc}
            autoPlay
            muted
            loop
            playsInline
            preload={index === 0 ? "auto" : "metadata"}
          />
        ) : desktopIsVideo ? (
          <img
            src={mobileSrc}
            alt={banner.title || "Banner"}
            className={`${styles.image} ${styles.mobileOnly}`}
            loading={index === 0 ? "eager" : "lazy"}
          />
        ) : null)}
    </>
  );
}

const BannerSlider = ({ banners }: BannerSliderProps) => {
  if (!banners.length) {
    return null;
  }
  const hasVideo = banners.some((banner) =>
    isBannerVideoSrc(banner.image, banner.mediaType),
  );
  return (
    <section className={styles.section}>
      <Swiper
        modules={[Pagination, Autoplay]}
        pagination={{
          clickable: true,
        }}
        autoplay={{
          delay: 4500,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        speed={700}
        loop={banners.length > 1}
        className={styles.swiper}
        onSwiper={hasVideo ? syncSlideMedia : undefined}
        onSlideChange={hasVideo ? syncSlideMedia : undefined}
      >
        {banners.map((banner, index) => (
          <SwiperSlide key={banner._id}>
            <div className={styles.banner}>
              <BannerMedia banner={banner} index={index} />
              <div className={styles.overlay}>
                <div className={styles.content}>
                  {banner.subtitle && (
                    <span className={styles.subtitle}>{banner.subtitle}</span>
                  )}
                  {banner.title && <h1 className={styles.title}>{banner.title}</h1>}
                  {banner.description && (
                    <p className={styles.description}>{banner.description}</p>
                  )}
                  {banner.buttonText && banner.link && (
                    <AppLink to={banner.link} className={styles.button}>
                      {banner.buttonText}
                    </AppLink>
                  )}
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
};

export default BannerSlider;
