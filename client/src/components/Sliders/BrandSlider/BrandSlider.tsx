import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import styles from "./BrandSlider.module.css";
import type { Brand } from "./types";
import BrandCard from "./BrandCard";
interface BrandSliderProps {
    title?: string;
    subTitle?: string;
    brands: Brand[];
}
const BrandSlider = ({ title = "Featured Brands", subTitle = "Trusted by Top Fashion Brands", brands, }: BrandSliderProps) => {
    return (<section className={styles.section}>
      <div className={styles.header}>
        <h2>{title}</h2>
        <p>{subTitle}</p>
      </div>
      <Swiper modules={[Navigation, Autoplay]} navigation autoplay={{
            delay: 2500,
            disableOnInteraction: false,
        }} loop spaceBetween={24} breakpoints={{
            320: {
                slidesPerView: 2,
            },
            640: {
                slidesPerView: 3,
            },
            768: {
                slidesPerView: 4,
            },
            1024: {
                slidesPerView: 5,
            },
            1400: {
                slidesPerView: 6,
            },
        }}>
        {brands.map((brand) => (<SwiperSlide key={brand.id}>
            <BrandCard brand={brand}/>
          </SwiperSlide>))}
      </Swiper>
    </section>);
};
export default BrandSlider;
