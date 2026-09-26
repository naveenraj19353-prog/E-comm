import { lazy } from "react";

export const Home = lazy(() => import("../pages/Home"));
export const Products = lazy(() => import("../pages/Products"));
export const ProductDetails = lazy(() => import("../pages/ProductDetails/ProductDetails"));
export const Wishlist = lazy(() => import("../pages/Wishlist/Wishlist"));
export const Cart = lazy(() => import("../pages/Cart/Cart"));
export const Checkout = lazy(() => import("../pages/Checkout/Checkout"));
export const ThankYou = lazy(() => import("../pages/ThankYou"));
export const MyOrders = lazy(() => import("../pages/Orders/MyOrders"));
export const OrderDetail = lazy(() => import("../pages/Orders/OrderDetail"));
export const Profile = lazy(() => import("../pages/Profile/Profile"));
export const Login = lazy(() => import("../pages/Login/Login"));
export const StorefrontLogin = lazy(() => import("../pages/Login/StorefrontLogin"));
export const StorefrontRegister = lazy(() => import("../pages/Register/StorefrontRegister"));
export const StorefrontForgotPassword = lazy(() => import("../pages/Auth/StorefrontForgotPassword"));
export const StorefrontResetPassword = lazy(() => import("../pages/Auth/StorefrontResetPassword"));
export const AdminForgotPassword = lazy(() => import("../pages/Auth/AdminForgotPassword"));
export const AdminResetPassword = lazy(() => import("../pages/Auth/AdminResetPassword"));
export const LegacyAuthRedirect = lazy(() => import("../pages/Login/LegacyAuthRedirect"));
export const Logout = lazy(() => import("../pages/Logout/Logout"));
export const AdminDashboard = lazy(() => import("../features/admin/pages/AdminDashboard"));
export const AdminTenants = lazy(() => import("../features/admin/pages/TenantsPage"));
export const AdminTenant = lazy(() => import("../features/admin/pages/AdminTenant"));
export const EditTenant = lazy(() => import("../features/admin/pages/EditTenant"));
export const CreateTenant = lazy(() => import("../features/admin/pages/CreateTenant"));
export const AdminTenantProducts = lazy(() => import("../features/admin/pages/AdminTenantProducts"));
export const AdminStoreManagers = lazy(() => import("../features/admin/pages/AdminStoreManagers"));
export const AdminCustomers = lazy(() => import("../features/admin/pages/AdminCustomers"));
export const AdminContactMessages = lazy(
    () => import("../features/admin/pages/AdminContactMessages"),
);
export const CreateProduct = lazy(() => import("../features/admin/pages/CreateProduct"));
export const BulkProductImport = lazy(() => import("../features/admin/pages/BulkProductImport"));
export const AdminTenantOrders = lazy(() => import("../features/admin/pages/AdminTenantOrders"));
export const AdminSalesDashboard = lazy(() => import("../features/admin/pages/AdminSalesDashboard"));
export const AdminTenantPayments = lazy(() => import("../features/admin/pages/AdminTenantPayments"));
export const AdminLedgerOverview = lazy(() => import("../features/admin/pages/AdminLedgerOverview"));
export const AdminTenantBilling = lazy(() => import("../features/admin/pages/AdminTenantBilling"));
export const AdminBillingOverview = lazy(() => import("../features/admin/pages/AdminBillingOverview"));
export const AdminMenuDesk = lazy(() => import("../features/admin/pages/AdminMenuDesk"));
export const AdminOrderDetail = lazy(() => import("../features/admin/pages/AdminOrderDetail"));
export const AdminTenantBanners = lazy(() => import("../features/admin/pages/AdminTenantBanners"));
export const AdminTenantCoupons = lazy(() => import("../features/admin/pages/AdminTenantCoupons"));
export const DelhiverySettingsPage = lazy(
    () => import("../features/admin/pages/DelhiverySettingsPage"),
);
export const TaxSettingsPage = lazy(
    () => import("../features/admin/pages/TaxSettingsPage"),
);
export const PeriskopeSettingsPage = lazy(
    () => import("../features/admin/pages/PeriskopeSettingsPage"),
);
export const ThemeCustomizer = lazy(() => import("../pages/ThemeCustomizer/ThemeCustomizer"));
export const NotFound = lazy(() => import("../pages/NotFound"));
export const Welcome = lazy(() => import("../pages/Welcome"));
export const WelcomeHome = lazy(() => import("../pages/WelcomeHome"));
export const CreateStore = lazy(() => import("../pages/CreateStore"));
export const StorefrontLegalPage = lazy(() => import("../pages/Legal/StorefrontLegalPage"));
export const PlatformLegalPage = lazy(() => import("../pages/Legal/PlatformLegalPage"));
