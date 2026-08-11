import { useAppSelector } from "../app/hooks";
import { useCategory } from "../features/products/hooks/useCategory";
import HeroSlider from "../components/HeroSlider/HeroSlider";
import ProductCardSlider from "../components/card/Productcardslider";
import ProductSlider from "../components/sliders/ProductSlider";
import DealOfTheDay from "../components/DealOfTheDay/DealOfTheDay";
import type { Brand } from "../components/sliders/BrandSlider";
import BrandSlider from "../components/sliders/BrandSlider";
import Testimonials from "../components/Testimonials";
import { testimonials } from "../components/Testimonials/dummyTestimonials";
import { useProducts } from "../features/products/hooks/useProducts";

const Home = () => {
  const tenantSlug = useAppSelector(
    (state) => state.tenant.tenantSlug
  );

  const { data, isLoading, isError, refetch } =
    useProducts("TENANT001");
  const { data: category } =
    useCategory("TENANT001");
  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (isError) {
    return (
      <div>
        Failed to load products.
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }
  console.log(data)

  const slides = [
    {
      eyebrow: 'NEW ERA OF DESIGN',
      titlePlain: 'Futuristic Essentials for the',
      titleAccent: 'Modern Life.',
      description:
        'Experience the pinnacle of minimalist engineering. Lunar Tech brings you a curated selection of premium products designed to elevate every interaction.',
      primaryCta: { label: 'Shop the Collection', href: '/shop' },
      secondaryCta: { label: 'View Lookbook', href: '/lookbook' },
      stats: [
        { value: '12k+', label: 'Happy Clients' },
        { value: '4.9/5', label: 'Rating', stars: 5 },
      ],
      image: 'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
      badge: { eyebrow: 'LIMITED EDITION', title: 'Quantum Series X', price: '$1,299' },
    },
    {
      eyebrow: 'SUMMER DROP',
      titlePlain: 'Lightweight Design for the',
      titleAccent: 'Everyday Carry.',
      description:
        'Built for movement without compromise. Every piece in this drop pairs premium materials with a silhouette that disappears into daily life.',
      primaryCta: { label: 'Explore the Drop', href: '/drop' },
      secondaryCta: { label: 'See Reviews', href: '/reviews' },
      stats: [
        { value: '8k+', label: 'Units Sold' },
        { value: '4.8/5', label: 'Rating', stars: 5 },
      ],
      image: 'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
      badge: { eyebrow: 'NEW ARRIVAL', title: 'Aero Carry', price: '$249' },
    },
  ];


  const products = [
    {
      id: 'p1',
      images: [
        'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
        'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
        'https://lajreedesigner.com/cdn/shop/files/LD-30101-Rama_5.jpg?v=1772531723&width=535',
      ],
      brand: 'Sangria',
      title: 'Saree With Blouse Piece',
      price: 657,
      originalPrice: 2496,
      rating: { value: 4, count: '3k' },
    },
    {
      id: 'p2',
      images: [
        'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
        'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
        'https://lajreedesigner.com/cdn/shop/files/LD-30101-Rama_5.jpg?v=1772531723&width=535',
      ],
      brand: 'KL9KIDS',
      title: 'Mirror Work Art Silk Heavy Work Banarasi Saree',
      price: 1431,
      originalPrice: 7999,
      badge: { label: 'NEW', variant: 'new' },
      sizes: 'Onesize',
    },
    {
      id: 'p3',
      images: [
        'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
        'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
        'https://lajreedesigner.com/cdn/shop/files/LD-30101-Rama_5.jpg?v=1772531723&width=535',
      ],
      brand: 'Anouk',
      title: 'Saree',
      price: 1352,
      originalPrice: 4299,
      badge: { label: 'NEW', variant: 'new' },
    },
    {
      id: 'p4',
      images: [
        'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
        'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
        'https://lajreedesigner.com/cdn/shop/files/LD-30101-Rama_5.jpg?v=1772531723&width=535',
      ],
      brand: 'Shriyangan',
      title: 'Ethnic Motifs Banarasi Art Silk',
      price: 660,
      originalPrice: 2499,
      badge: { label: 'AD', variant: 'ad' },
      rating: { value: 2.8, count: 28 },
    },
    {
      id: 'p5',
      images: [
        'https://lajreedesigner.com/cdn/shop/files/LD-40102-Sky_5.jpg?v=1772264739&width=535',
        'https://lajreedesigner.com/cdn/shop/files/Sosy-Chinar-Pashmina3-64_1.jpg?v=1767247567&width=535',
        'https://lajreedesigner.com/cdn/shop/files/LD-30101-Rama_5.jpg?v=1772531723&width=535',
      ],
      brand: 'Brood',
      title: 'Navy Blue Pashmina Saree With Embroidery',
      price: 3299,
      originalPrice: 4199,
      badge: { label: '-21%', variant: 'discount' },
      rating: { value: 4.5, count: 27 },
    },
  ];
  const products2 = [
    {
      id: "1",
      productName: "Women's Cotton Dress",
      image: "https://picsum.photos/400?1",
      price: 1499,
      originalPrice: 2499,
      rating: 4.8,
      reviews: 240,
      discount: 40,
    },
    {
      id: "2",
      productName: "Floral Kurti",
      image: "https://picsum.photos/400?2",
      price: 999,
      originalPrice: 1699,
      rating: 4.6,
      reviews: 120,
      discount: 25,
    },
    {
      id: "3",
      productName: "Silk Saree",
      image: "https://picsum.photos/400?3",
      price: 3299,
      originalPrice: 4599,
      rating: 4.9,
      reviews: 510,
      discount: 30,
    },
    {
      id: "4",
      productName: "Party Wear Gown",
      image: "https://picsum.photos/400?4",
      price: 2599,
      originalPrice: 3599,
      rating: 4.7,
      reviews: 190,
      discount: 28,
    },
    {
      id: "5",
      productName: "Denim Jacket",
      image: "https://picsum.photos/400?5",
      price: 1999,
      originalPrice: 2899,
      rating: 4.5,
      reviews: 320,
      discount: 20,
    },
  ];
   const brands: Brand[] = [
    {
      id: "1",
      name: "Nike",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg",
    },
    {
      id: "2",
      name: "Adidas",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/2/20/Adidas_Logo.svg",
    },
    {
      id: "3",
      name: "Puma",
      logo:
        "https://upload.wikimedia.org/wikipedia/en/f/fd/Puma_AG.svg",
    },
    {
      id: "4",
      name: "Levi's",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/0/0d/Levi%27s_logo.svg",
    },
    {
      id: "5",
      name: "Zara",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/f/fd/Zara_Logo.svg",
    },
    {
      id: "6",
      name: "H&M",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/5/53/H%26M-Logo.svg",
    },
    {
      id: "7",
      name: "Gucci",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/7/79/1960s_Gucci_Logo.svg",
    },
    {
      id: "8",
      name: "Louis Vuitton",
      logo:
        "https://upload.wikimedia.org/wikipedia/commons/c/c1/Louis_Vuitton_LV_logo.svg",
    },
  ];
  return (
    <div>
      <HeroSlider
        slides={slides}
        announcement="FREE SHIPPING ON ALL ORDERS OVER $150 — LIMITED TIME ONLY"
        autoPlay
        interval={2000}
      />
      <ProductCardSlider
        title="Trending Sarees"
        products={products}
        onToggleWishlist={(id, isWishlisted) => {
          // persist to context/API here
          console.log(id, isWishlisted);
        }}
      />
      <ProductSlider
        title="Trending Products"
        products={products2}
      />
      <DealOfTheDay
        products={products2}
      />
      <BrandSlider
        brands={brands}
      />
      <Testimonials testimonials={testimonials} />
    </div>
  );
};

export default Home;