import { createBrowserRouter } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import Home from "../pages/Home";
import Products from "../pages/Products/ProductsPage";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";

import TenantLoader from "../features/tenant/TenantLoader";

import Wishlist from "../pages/Wishlist/Wishlist";
import Cart from "../pages/Cart/Cart";
import ProductDetails from "../pages/ProductDetails/ProductDetails";

export const router = createBrowserRouter([
  {
    path: "/:tenantSlug",
    element: <TenantLoader />,

    children: [
      {
        element: <MainLayout />,

        children: [
          {
            index: true,
            element: <Home />,
          },

          {
            path: "products",
            element: <Products />,
          },

          {
            path: "product-details/:productId",
            element: <ProductDetails />,
          },

          {
            path: "wishlist",
            element: <Wishlist />,
          },

          {
            path: "cart",
            element: <Cart />,
          },
        ],
      },
    ],
  },

  {
    path: "/login",
    element: <Login />,
  },

  {
    path: "*",
    element: <NotFound />,
  },
]);
