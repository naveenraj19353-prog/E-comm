import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";

import "swiper/css";
import "swiper/css/navigation";

import ProductCard from "../ProductCard/ProductCardSimple/ProductCard";
import styles from "./ProductCarousel.module.css";
import type { Product } from "../../types/product";
import FlipProductCard from "../ProductCard/ProductCardWithFlipEffect/FlipProductCard";



interface Props {
  products: Product[];
}


const ProductCarousel = ({ products }: Props) => {
console.log("ProductCarousel", products)

  return (
    <div className={styles.wrapper}>
      <Swiper
        modules={[Navigation, Autoplay]}
        navigation
        loop
        autoplay={{
          delay: 3000,
          disableOnInteraction: false,
          pauseOnMouseEnter: true,
        }}
        spaceBetween={20}
        slidesPerView={4}
        breakpoints={{
          320: { slidesPerView: 1 },
          640: { slidesPerView: 2 },
          900: { slidesPerView: 3 },
          1200: { slidesPerView: 4 },
        }}
      >
        {products.map((product) => (
          <SwiperSlide key={product._id}>
            <FlipProductCard
              badge={
                product.discountPercentage > 30
                  ? "Hot"
                  : product.discountPercentage > 15
                  ? "Sale"
                  : "New"
              }
              image={product.images[0]}
              category={product.categoryId}
              title={product.name}
              description={product.description}
              features={product.sizes}
              oldPrice={product.price}
              price={product.finalPrice}
              rating={product.averageRating}
              reviews={product.reviewCount}
            //   stock={product.stock > 0 ? "In Stock" : "Out of Stock"}
              onAddToCart={() => console.log(product)}
            />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
};

export default ProductCarousel;