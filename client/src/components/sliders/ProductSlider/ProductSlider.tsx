import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import ProductCard from "./ProductCard";
import type { Product } from "./types";
import styles from "./ProductSlider.module.css";
interface ProductSliderProps {
  title: string;
  products: Product[];
}
const ProductSlider = ({ title, products }: ProductSliderProps) => {
  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <h2>{title}</h2>
        <div className={styles.line}></div>
      </div>
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        navigation
        pagination={{
          clickable: true,
        }}
        autoplay={{
          delay: 3000,
          disableOnInteraction: false,
        }}
        loop
        spaceBetween={24}
        breakpoints={{
          320: {
            slidesPerView: 1.2,
          },
          576: {
            slidesPerView: 2,
          },
          768: {
            slidesPerView: 3,
          },
          1024: {
            slidesPerView: 4,
          },
          1400: {
            slidesPerView: 5,
          },
        }}
      >
        {products.map((product) => (
          <SwiperSlide key={product.id}>
            <ProductCard product={product} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  );
};
export default ProductSlider;
