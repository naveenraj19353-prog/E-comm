import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import TenantLoader from "../features/tenant/TenantLoader";
import { getTenantSlugFromHostname } from "../features/tenant/tenantHost";
import RequireStorefrontAuth from "../features/auth/RequireStorefrontAuth";
import RequireStoreAdminAuth from "../features/auth/RequireStoreAdminAuth";
import AdminLayout from "../features/admin/components/AdminLayout";
import {
    AdminDashboard,
    AdminForgotPassword,
    AdminOrderDetail,
    AdminResetPassword,
    AdminTenant,
    AdminTenantOrders,
    AdminTenantProducts,
    AdminTenants,
    BulkProductImport,
    Cart,
    Checkout,
    CreateProduct,
    CreateStore,
    CreateTenant,
    EditTenant,
    Home,
    LegacyAuthRedirect,
    Login,
    Logout,
    MyOrders,
    NotFound,
    OrderDetail,
    ProductDetails,
    Products,
    Profile,
    StorefrontForgotPassword,
    StorefrontLogin,
    StorefrontRegister,
    StorefrontResetPassword,
    ThankYou,
    ThemeCustomizer,
    Welcome,
    WelcomeHome,
    Wishlist,
} from "./LazyRouteComponents";

const hostTenantSlug = getTenantSlugFromHostname();

const storefrontChildRoutes = [
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
                path: "thank-you/:orderId",
                element: (
                    <RequireStorefrontAuth>
                        <ThankYou />
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
];

const adminRoutes = [
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
];

export const router = createBrowserRouter([
    {
        path: "/create-store",
        element: <CreateStore />,
    },
    {
        path: "/welcome-alt",
        element: <Welcome />,
    },
    ...(hostTenantSlug
        ? [
            {
                path: "/",
                element: <TenantLoader />,
                children: storefrontChildRoutes,
            },
        ]
        : [
            {
                path: "/",
                element: <WelcomeHome />,
            },
            {
                path: "/:tenantSlug",
                element: <TenantLoader />,
                children: storefrontChildRoutes,
            },
        ]),
    ...adminRoutes,
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
