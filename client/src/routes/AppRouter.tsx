import { createBrowserRouter } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import TenantLoader from "../features/tenant/TenantLoader";
import { getTenantSlugFromHostname } from "../features/tenant/tenantHost";
import RequireStorefrontAuth from "../features/auth/RequireStorefrontAuth";
import RequireStoreAdminAuth from "../features/auth/RequireStoreAdminAuth";
import { startAuthSessionSync } from "../features/auth/sessionSync";
import AdminLayout from "../features/admin/components/AdminLayout";
import RequireTenantBusinessType from "../features/admin/components/RequireTenantBusinessType";
import RequireStorePermission from "../features/admin/components/RequireStorePermission";
import {
    AdminBillingOverview,
    AdminDashboard,
    AdminForgotPassword,
    AdminLedgerOverview,
    AdminOrderDetail,
    AdminResetPassword,
    AdminTenant,
    AdminTenantOrders,
    AdminSalesDashboard,
    AdminTenantPayments,
    AdminTenantBilling,
    AdminMenuDesk,
    AdminCustomers,
    AdminContactMessages,
    AdminStoreManagers,
    AdminTenantProducts,
    AdminTenantBanners,
    AdminTenantCoupons,
    AdminTenants,
    AdminTenantTax,
    DelhiverySettingsPage,
    PeriskopeSettingsPage,
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
    StorefrontLegalPage,
    PlatformLegalPage,
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
                    <RequireStorefrontAuth allowGuest>
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
            {
                path: "about",
                element: <StorefrontLegalPage />,
            },
            {
                path: "contact",
                element: <StorefrontLegalPage />,
            },
            {
                path: "privacy",
                element: <StorefrontLegalPage />,
            },
            {
                path: "terms",
                element: <StorefrontLegalPage />,
            },
            {
                path: "returns",
                element: <StorefrontLegalPage />,
            },
            {
                path: "shipping",
                element: <StorefrontLegalPage />,
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
                path: "payouts",
                element: <AdminLedgerOverview />,
            },
            {
                path: "billing",
                element: <AdminBillingOverview />,
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
                        element: (
                            <RequireStorePermission anyOf={["read", "products_update", "inventory"]}>
                                <AdminTenantProducts />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/customers",
                        element: (
                            <RequireStorePermission permission="customers">
                                <AdminCustomers />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/messages",
                        element: (
                            <RequireStorePermission permission="customers">
                                <AdminContactMessages />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/team",
                        element: <AdminStoreManagers />,
                    },
                    {
                        path: ":tenantId/payments",
                        element: <AdminTenantPayments />,
                    },
                    {
                        path: ":tenantId/billing",
                        element: <AdminTenantBilling />,
                    },
                    {
                        path: ":tenantId/products/create",
                        element: (
                            <RequireStorePermission permission="products_update">
                                <CreateProduct />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/products/bulk",
                        element: (
                            <RequireStorePermission permission="products_update">
                                <BulkProductImport />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/orders",
                        element: (
                            <RequireTenantBusinessType allowed={["retail"]}>
                                <RequireStorePermission permission="orders">
                                    <AdminTenantOrders />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/analytics",
                        element: (
                            <RequireTenantBusinessType allowed={["retail", "menu"]}>
                                <RequireStorePermission permission="orders">
                                    <AdminSalesDashboard />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/menu",
                        element: (
                            <RequireTenantBusinessType allowed={["menu"]}>
                                <RequireStorePermission permission="menu">
                                    <AdminMenuDesk />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/orders/:orderId",
                        element: (
                            <RequireTenantBusinessType allowed={["retail"]}>
                                <RequireStorePermission permission="orders">
                                    <AdminOrderDetail />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/banners",
                        element: (
                            <RequireTenantBusinessType
                                allowed={["retail", "service"]}
                            >
                                <RequireStorePermission permission="banners">
                                    <AdminTenantBanners />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/coupons",
                        element: (
                            <RequireTenantBusinessType
                                allowed={["retail", "service"]}
                            >
                                <RequireStorePermission permission="coupons">
                                    <AdminTenantCoupons />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/tax",
                        element: (
                            <RequireStorePermission permission="products_update">
                                <AdminTenantTax />
                            </RequireStorePermission>
                        ),
                    },
                    {
                        path: ":tenantId/shipping/delhivery",
                        element: (
                            <RequireTenantBusinessType allowed={["retail"]}>
                                <RequireStorePermission permission="shipping">
                                    <DelhiverySettingsPage />
                                </RequireStorePermission>
                            </RequireTenantBusinessType>
                        ),
                    },
                    {
                        path: ":tenantId/integrations/periskope",
                        element: (
                            <RequireStorePermission permission="whatsapp">
                                <PeriskopeSettingsPage />
                            </RequireStorePermission>
                        ),
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
    {
        path: "/legal/:page",
        element: <PlatformLegalPage />,
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

// Swap the signed-in session when moving between stores / the admin panel.
startAuthSessionSync(router);

// Land at the top of the new page instead of wherever the last page was
// scrolled to. Browser back/forward keeps the position it already had.
let lastPathname = router.state.location.pathname;
router.subscribe((state) => {
    if (state.navigation.state !== "idle") {
        return;
    }
    if (state.location.pathname === lastPathname) {
        return;
    }
    lastPathname = state.location.pathname;
    if (state.historyAction !== "POP") {
        window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    }
});
