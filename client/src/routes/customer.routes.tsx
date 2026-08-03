import Cart from "../pages/cart/Cart";
import Home from "../pages/home/Home";
import ProductDetails from "../pages/products/ProductDetails/ProductDetails";
import ProductList from "../pages/products/ProductList/ProductList";
import { PATH } from "./path";

export const customerRoutes = [
  {
    path: PATH.HOME,
    element: <Home />,
  },
  {
    path: PATH.PRODUCTS,
    element: <ProductList />,
  },
  {
    path: PATH.PRODUCT_DETAILS,
    element: <ProductDetails />,
  },
  {
    path: PATH.CART,
    element: <Cart />,
  },
];