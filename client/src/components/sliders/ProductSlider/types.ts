export interface Product {
  id: string;
  productName: string;
  image: string;
  price: number;
  originalPrice: number;
  rating: number;
  reviews: number;
  discount: number;
}
export const products: Product[] = [
  {
    id: "1",
    productName: "Women's Cotton Dress",
    image: "https:
    price: 1499,
    originalPrice: 2499,
    rating: 4.8,
    reviews: 240,
    discount: 40,
  },
  {
    id: "2",
    productName: "Floral Kurti",
    image: "https:
    price: 999,
    originalPrice: 1699,
    rating: 4.6,
    reviews: 120,
    discount: 25,
  },
  {
    id: "3",
    productName: "Silk Saree",
    image: "https:
    price: 3299,
    originalPrice: 4599,
    rating: 4.9,
    reviews: 510,
    discount: 30,
  },
  {
    id: "4",
    productName: "Party Wear Gown",
    image: "https:
    price: 2599,
    originalPrice: 3599,
    rating: 4.7,
    reviews: 190,
    discount: 28,
  },
  {
    id: "5",
    productName: "Denim Jacket",
    image: "https:
    price: 1999,
    originalPrice: 2899,
    rating: 4.5,
    reviews: 320,
    discount: 20,
  },
];
