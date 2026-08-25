import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Pagination, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/pagination";
import TestimonialCard from "./TestimonialCard";
import type { Testimonial } from "./types";
import styles from "./Testimonials.module.css";
interface Props {
    testimonials: Testimonial[];
}
const Testimonials = ({ testimonials }: Props) => {
    return (<section className={styles.section}>
      <div className={styles.header}>
        <h2>What Our Customers Say</h2>
        <p>Thousands of happy customers trust our fashion store.</p>
      </div>
      <Swiper modules={[Navigation, Pagination, Autoplay]} navigation pagination={{ clickable: true }} autoplay={{
            delay: 3500,
            disableOnInteraction: false,
        }} loop spaceBetween={24} breakpoints={{
            320: {
                slidesPerView: 1,
            },
            768: {
                slidesPerView: 2,
            },
            1200: {
                slidesPerView: 3,
            },
        }}>
        {testimonials.map((item) => (<SwiperSlide key={item.id}>
            <TestimonialCard testimonial={item}/>
          </SwiperSlide>))}
      </Swiper>
    </section>);
};
export default Testimonials;
