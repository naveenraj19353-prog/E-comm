import { useState } from "react";
import Banner from "../components/banner/banner";

import { useAppSelector } from "../redux/hooks";
import { useProducts } from "../hooks/queries/useProducts";
import { useCategories } from "../hooks/queries/useCategories";
import FlipProductCard from "../components/ProductCard/ProductCardWithFlipEffect/FlipProductCard";



import { Swiper, SwiperSlide } from "swiper/react";
import { Navigation, Autoplay } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import swiperStypes from "../components/ProductCarousel/ProductCarousel.module.css"
import styles from "./Home.module.css"
import SectionHeader from "../components/heading/Heading";

const Home = () => {
  const tenantId = useAppSelector(
    (state) => state.tenant.tenantId
  );

  const [category, setCategory] = useState("Women");

  const { data: products, isLoading, isError } =
    useProducts(tenantId);
  const {
    data: categoryResponse,
    isLoading: isCategoryLoading,
    isError: isCategoryError,
  } = useCategories(tenantId);

  const categories =
    categoryResponse?.data ?? [];

  // const filteredProducts =
  //   products?.data?.filter(
  //     (product) => product.categoryId === category.name
  //   ) ?? [];

  // console.log("products", categories, products)


  return (
    <section>
      <Banner
        slides={[
          {
            image:
              "https://optimal-demos.myshopify.com/cdn/shop/files/demo9-slide1.jpg?v=1701331573",
            title: "Summer Collection",
            subTitle: "Discover our",
            highlightText: "Latest Arrivals",
            primaryButtonText: "Shop Women",
            secondaryButtonText: "Shop Men",
            onPrimaryClick: () => console.log("Women"),
            onSecondaryClick: () => console.log("Men"),
          },
          {
            image:
              "https://optimal-demo.myshopify.com/cdn/shop/files/men-slide8_2000x.jpg?v=1704803378",
            title: "Men's Fashion",
            subTitle: "New Season",
            highlightText: "2026",
            primaryButtonText: "Explore",
            secondaryButtonText: "View Deals",
          },
          {
            image:
              "https://www.pxdraft.com/wrap/shopapp/assets/img/fashion2/home-banner-4.jpg",
            title: "Men's Fashion",
            subTitle: "New Season",
            highlightText: "2026",
            primaryButtonText: "Explore",
            secondaryButtonText: "View Deals",
          },
        ]}
      />

      <div className={swiperStypes.wrapper}>
        <SectionHeader
          title="Trending Now"
          subtitle="Explore the latest popular collections"
          actionText="View All"
          onActionClick={() => console.log("clicked")}
        />
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
            1200: { slidesPerView: 5 },
          }}
        >
          {categories.map((category) => (
            <SwiperSlide key={category._id}>
              <FlipProductCard
                key={category._id}
                badge={category.isActive ? "Active" : ""}
                badgeType={category.isActive ? "hot" : "sale"}
                image={'https://picsum.photos/600/600?random=9506'}
                category="Category"
                title={category.name}
                description={category.description}
                theme="blue"
                label={"View"}
              />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      {/* <div className={styles.categorySection}>
        {
          categories.map((obj) => (
            <FlipProductCard
              key={obj._id}
              badge={obj.isActive ? "Active" : ""}
              badgeType={obj.isActive ? "hot" : "sale"}
              image={'https://picsum.photos/600/600?random=9506'}
              category="Category"
              title={obj.name}
              description={obj.description}
              theme="blue"
              label={"View"}
            />
          ))
        }
      </div> */}

      {/* {filteredProducts.length > 0 && (
        <ProductCarousel products={filteredProducts} />
      )} */}
    </section>
  );
};

export default Home;