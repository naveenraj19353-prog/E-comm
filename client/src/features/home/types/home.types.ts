import type { Product } from "../../products/types";

export interface HomeCategory {
  id: string;
  name: string;
  description?: string;
  image?: string | null;
}

export interface HomeBanner {
  id?: string;
  eyebrow?: string;
  title?: string;
  titleAccent?: string;
  description?: string;
  image: string;
  primaryCta?: {
    label: string;
    href: string;
  };
  secondaryCta?: {
    label: string;
    href: string;
  };
  active?: boolean;
  priority?: number;
}

export interface HomeBrand {
  id: string;
  name: string;
  logo: string;
}

export interface SellingProduct extends Product {
  totalSold?: number;
  orderCount?: number;
}

export interface HomeData {
  banners: HomeBanner[];
  categories: HomeCategory[];
  trendingProducts: Product[];
  bestDiscountProducts: Product[];
  mostSellingProducts: SellingProduct[];
  newArrivals: Product[];
  topRatedProducts: Product[];
  dealOfTheDay: Product[];
  brands: HomeBrand[];
}

export interface HomeResponse {
  success: boolean;
  message: string;
  data: HomeData;
}
