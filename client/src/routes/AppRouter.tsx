import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Home from "../pages/Home";
import Products from "../pages/Products";
import ProductDetails from "../pages/ProductDetails/ProductDetails";
import Wishlist from "../pages/Wishlist/Wishlist";
import Cart from "../pages/Cart/Cart";
import Checkout from "../pages/Checkout/Checkout";
import MyOrders from "../pages/Orders/MyOrders";
import OrderDetail from "../pages/Orders/OrderDetail";
import Profile from "../pages/Profile/Profile";
import TenantLoader from "../features/tenant/TenantLoader";
import Login from "../pages/Login/Login";
import StorefrontLogin from "../pages/Login/StorefrontLogin";
import StorefrontRegister from "../pages/Register/StorefrontRegister";
import StorefrontForgotPassword from "../pages/Auth/StorefrontForgotPassword";
import StorefrontResetPassword from "../pages/Auth/StorefrontResetPassword";
import AdminForgotPassword from "../pages/Auth/AdminForgotPassword";
import AdminResetPassword from "../pages/Auth/AdminResetPassword";
import LegacyAuthRedirect from "../pages/Login/LegacyAuthRedirect";
import Logout from "../pages/Logout/Logout";
import RequireStorefrontAuth from "../features/auth/RequireStorefrontAuth";
import RequireStoreAdminAuth from "../features/auth/RequireStoreAdminAuth";
import AdminLayout from "../features/admin/components/AdminLayout";
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminTenants from "../features/admin/pages/TenantsPage";
import AdminTenant from "../features/admin/pages/AdminTenant";
import EditTenant from "../features/admin/pages/EditTenant";
import CreateTenant from "../features/admin/pages/CreateTenant";
import AdminTenantProducts from "../features/admin/pages/AdminTenantProducts";
import CreateProduct from "../features/admin/pages/CreateProduct";
import BulkProductImport from "../features/admin/pages/BulkProductImport";
import AdminTenantOrders from "../features/admin/pages/AdminTenantOrders";
import AdminOrderDetail from "../features/admin/pages/AdminOrderDetail";
import ThemeCustomizer from "../pages/ThemeCustomizer/ThemeCustomizer";
import NotFound from "../pages/NotFound";
import Welcome from "../pages/Welcome";
export const router = createBrowserRouter([
    {
        path: "/",
        element: <Welcome />,
    },
    {
        path: "/admin/login",
        element: <Login />,
    },
    {
        path: "/admin/forgot-password",
        element: <AdminForgotPassword />,
    },
    {
        path: "/admin/reset-password",
        element: <AdminResetPassword />,
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
                    {
                        path: ":tenantId/products/bulk",
                        element: <BulkProductImport />,
                    },
                    {
                        path: ":tenantId/orders",
                        element: <AdminTenantOrders />,
                    },
                    {
                        path: ":tenantId/orders/:orderId",
                        element: <AdminOrderDetail />,
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
                path: "customize",
                element: (
                    <RequireStoreAdminAuth>
                        <ThemeCustomizer />
                    </RequireStoreAdminAuth>
                ),
            },
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
                        path: "forgot-password",
                        element: <StorefrontForgotPassword />,
                    },
                    {
                        path: "reset-password",
                        element: <StorefrontResetPassword />,
                    },
                    {
                        path: "profile",
                        element: <Profile />,
                    },
                    {
                        path: "orders",
                        element: (
                            <RequireStorefrontAuth>
                                <MyOrders />
                            </RequireStorefrontAuth>
                        ),
                    },
                    {
                        path: "orders/:orderId",
                        element: (
                            <RequireStorefrontAuth>
                                <OrderDetail />
                            </RequireStorefrontAuth>
                        ),
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
