import { Autoplay, Navigation, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import styles from "./BannerSlider.module.css";
export interface Banner {
    _id: string;
    tenantId: string;
    title?: string;
    subtitle?: string;
    description?: string;
    image: string;
    mobileImage?: string;
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
const BannerSlider = ({ banners }: BannerSliderProps) => {
    if (!banners.length) {
        return null;
    }
    return (<section className={styles.section}>
      <Swiper modules={[Navigation, Pagination, Autoplay]} pagination={{
            clickable: true,
        }} autoplay={{
            delay: 4500,
            disableOnInteraction: false,
            pauseOnMouseEnter: true,
        }} speed={700} loop={banners.length > 1} className={styles.swiper}>
        {banners.map((banner) => (<SwiperSlide key={banner._id}>
            <div className={styles.banner}>
              <picture>
                {banner.mobileImage && (<source media="(max-width: 768px)" srcSet={banner.mobileImage}/>)}
                <img src={banner.image} alt={banner.title || "Banner"} className={styles.image}/>
              </picture>
              <div className={styles.overlay}>
                <div className={styles.content}>
                  {banner.subtitle && (<span className={styles.subtitle}>{banner.subtitle}</span>)}
                  {banner.title && (<h1 className={styles.title}>{banner.title}</h1>)}
                  {banner.description && (<p className={styles.description}>{banner.description}</p>)}
                  {banner.buttonText && banner.link && (<a href={banner.link} className={styles.button}>
                      {banner.buttonText}
                    </a>)}
                </div>
              </div>
            </div>
          </SwiperSlide>))}
      </Swiper>
    </section>);
};
export default BannerSlider;
