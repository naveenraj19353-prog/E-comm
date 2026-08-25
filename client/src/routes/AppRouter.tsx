import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Home from "../pages/Home";
import Products from "../pages/Products/ProductsPage";
import ProductDetails from "../pages/ProductDetails/ProductDetails";
import Wishlist from "../pages/Wishlist/Wishlist";
import Cart from "../pages/Cart/Cart";
import Checkout from "../pages/Checkout/Checkout";
import Profile from "../pages/Profile/Profile";
import TenantLoader from "../features/tenant/TenantLoader";
import Login from "../pages/Login/Login";
import StorefrontLogin from "../pages/Login/StorefrontLogin";
import StorefrontRegister from "../pages/Register/StorefrontRegister";
import LegacyAuthRedirect from "../pages/Login/LegacyAuthRedirect";
import Logout from "../pages/Logout/Logout";
import RequireStorefrontAuth from "../features/auth/RequireStorefrontAuth";
import AdminLayout from "../features/admin/components/AdminLayout";
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminTenants from "../features/admin/pages/TenantsPage";
import AdminTenant from "../features/admin/pages/AdminTenant";
import EditTenant from "../features/admin/pages/EditTenant";
import CreateTenant from "../features/admin/pages/CreateTenant";
import AdminTenantProducts from "../features/admin/pages/AdminTenantProducts";
import CreateProduct from "../features/admin/pages/CreateProduct";
import NotFound from "../pages/NotFound";
export const router = createBrowserRouter([
    {
        path: "/admin/login",
        element: <Login />,
    },
    {
        path: "/admin",
        element: <AdminLayout />,
        children: [
            {
                index: true,
                element: <AdminDashboard />,
            },
            {
                path: "tenants",
                children: [
                    {
                        index: true,
                        element: <AdminTenants />,
                    },
                    {
                        path: "create",
                        element: <CreateTenant />,
                    },
                    {
                        path: ":tenantId",
                        element: <AdminTenant />,
                    },
                    {
                        path: ":tenantId/edit",
                        element: <EditTenant />,
                    },
                    {
                        path: ":tenantId/products",
                        element: <AdminTenantProducts />,
                    },
                    {
                        path: ":tenantId/products/create",
                        element: <CreateProduct />,
                    },
                ],
            },
        ],
    },
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
                    {
                        path: "checkout",
                        element: (
                            <RequireStorefrontAuth>
                                <Checkout />
                            </RequireStorefrontAuth>
                        ),
                    },
                    {
                        path: "login",
                        element: <StorefrontLogin />,
                    },
                    {
                        path: "register",
                        element: <StorefrontRegister />,
                    },
                    {
                        path: "profile",
                        element: <Profile />,
                    },
                ],
            },
        ],
    },
    {
        path: "/register",
        element: <LegacyAuthRedirect mode="register"/>,
    },
    {
        path: "/login",
        element: <LegacyAuthRedirect mode="login"/>,
    },
    {
        path: "/logout",
        element: <Logout />,
    },
    {
        path: "*",
        element: <NotFound />,
    },
]);
