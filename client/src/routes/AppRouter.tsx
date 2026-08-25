import { createBrowserRouter } from "react-router-dom";
// ==========================================================
// STOREFRONT
// ==========================================================
import MainLayout from "../layouts/MainLayout";
import Home from "../pages/Home";
import Products from "../pages/Products/ProductsPage";
import ProductDetails from "../pages/ProductDetails/ProductDetails";
import Wishlist from "../pages/Wishlist/Wishlist";
import Cart from "../pages/Cart/Cart";
import Checkout from "../pages/Checkout/Checkout";
import Profile from "../pages/Profile/Profile";
import TenantLoader from "../features/tenant/TenantLoader";
// ==========================================================
// AUTH
// ==========================================================
import Login from "../pages/Login/Login";
import StorefrontLogin from "../pages/Login/StorefrontLogin";
import StorefrontRegister from "../pages/Register/StorefrontRegister";
import LegacyAuthRedirect from "../pages/Login/LegacyAuthRedirect";
import Logout from "../pages/Logout/Logout";
// ==========================================================
// ADMIN
// ==========================================================
import AdminLayout from "../features/admin/components/AdminLayout";
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminTenants from "../features/admin/pages/TenantsPage";
import AdminTenant from "../features/admin/pages/AdminTenant";
import EditTenant from "../features/admin/pages/EditTenant";
import CreateTenant from "../features/admin/pages/CreateTenant";
import AdminTenantProducts from "../features/admin/pages/AdminTenantProducts";
import CreateProduct from "../features/admin/pages/CreateProduct";
import NotFound from "../pages/NotFound";
// ==========================================================
// ROUTER
// ==========================================================
export const router = createBrowserRouter([
  // ========================================================
  // ADMIN LOGIN
  // PUBLIC
  // ========================================================
  {
    path: "/admin/login",
    element: <Login />,
  },
  // ========================================================
  // ADMIN PORTAL
  // PROTECTED BY AdminLayout
  // ========================================================
  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      // ======================================================
      // SUPER ADMIN DASHBOARD
      // /admin
      // ======================================================
      {
        index: true,
        element: <AdminDashboard />,
      },
      // ======================================================
      // TENANTS
      // /admin/tenants
      // ======================================================
      {
        path: "tenants",
        children: [
          // --------------------------------------------------
          // ALL TENANTS
          // SUPER ADMIN ONLY
          //
          // /admin/tenants
          // --------------------------------------------------
          {
            index: true,
            element: <AdminTenants />,
          },
          // --------------------------------------------------
          // CREATE TENANT
          // SUPER ADMIN ONLY
          //
          // /admin/tenants/create
          // --------------------------------------------------
          {
            path: "create",
            element: <CreateTenant />,
          },
          // --------------------------------------------------
          // TENANT DETAILS
          //
          // SUPER ADMIN:
          //   /admin/tenants/shopsphere
          //
          // TENANT ADMIN:
          //   /admin/tenants/shopsphere
          //
          // AdminLayout must ensure admin can only access
          // his own tenant.
          // --------------------------------------------------
          {
            path: ":tenantId",
            element: <AdminTenant />,
          },
          // --------------------------------------------------
          // EDIT TENANT
          // SUPER ADMIN ONLY
          //
          // /admin/tenants/shopsphere/edit
          // --------------------------------------------------
          {
            path: ":tenantId/edit",
            element: <EditTenant />,
          },
          // --------------------------------------------------
          // TENANT PRODUCTS
          //
          // /admin/tenants/shopsphere/products
          // --------------------------------------------------
          {
            path: ":tenantId/products",
            element: <AdminTenantProducts />,
          },
          // --------------------------------------------------
          // CREATE PRODUCT
          //
          // /admin/tenants/shopsphere/products/create
          // --------------------------------------------------
          {
            path: ":tenantId/products/create",
            element: <CreateProduct />,
          },
        ],
      },
    ],
  },
  // ========================================================
  // TENANT STOREFRONT
  //
  // Example:
  // /shopsphere
  // /shopsphere/products
  // /shopsphere/cart
  // ========================================================
  {
    path: "/:tenantSlug",
    element: <TenantLoader />,
    children: [
      {
        element: <MainLayout />,
        children: [
          // --------------------------------------------------
          // HOME
          // /shopsphere
          // --------------------------------------------------
          {
            index: true,
            element: <Home />,
          },
          // --------------------------------------------------
          // PRODUCTS
          // /shopsphere/products
          // --------------------------------------------------
          {
            path: "products",
            element: <Products />,
          },
          // --------------------------------------------------
          // PRODUCT DETAILS
          // /shopsphere/product-details/:productId
          // --------------------------------------------------
          {
            path: "product-details/:productId",
            element: <ProductDetails />,
          },
          // --------------------------------------------------
          // WISHLIST
          // /shopsphere/wishlist
          // --------------------------------------------------
          {
            path: "wishlist",
            element: <Wishlist />,
          },
          // --------------------------------------------------
          // CART
          // /shopsphere/cart
          // --------------------------------------------------
          {
            path: "cart",
            element: <Cart />,
          },
          // --------------------------------------------------
          // CHECKOUT
          // /shopsphere/checkout
          // --------------------------------------------------
          {
            path: "checkout",
            element: <Checkout />,
          },
          // --------------------------------------------------
          // PROFILE
          // /shopsphere/profile
          // --------------------------------------------------
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
  // ========================================================
  // CUSTOMER REGISTER
  // PUBLIC
  //
  // /register
  // ========================================================
  {
    path: "/register",
    element: <LegacyAuthRedirect mode="register" />,
  },
  {
    path: "/login",
    element: <LegacyAuthRedirect mode="login" />,
  },
  // ========================================================
  // LOGOUT
  // ========================================================
  {
    path: "/logout",
    element: <Logout />,
  },
  // ========================================================
  // 404
  // ========================================================
  {
    path: "*",
    element: <NotFound />,
  },
]);
