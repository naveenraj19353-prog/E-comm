import { createBrowserRouter } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import Home from "../pages/Home";
import Products from "../pages/Products/ProductsPage";
// import ProductDetails from "../pages/ProductDetails";
import Cart from "../pages/Cart";
// import Wishlist from "../pages/Wishlist";
// import Profile from "../pages/Profile";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import TenantLoader from "../features/tenant/TenantLoader";
import Wishlist from "../pages/Wishlist";
import { routes } from "./routes";

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
                        path: routes.cart(":tenantSlug"),
                        element: <Cart />,
                    },
                    {
                        path: "products",
                        element: <Products />,
                    },
                    {
                        path: "wishlist",
                        element: <Wishlist />,
                    },
            ]
            }
        ]
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