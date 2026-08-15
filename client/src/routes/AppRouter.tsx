import { createBrowserRouter } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import Home from "../pages/Home";
import Products from "../pages/Products/ProductsPage";
import Login from "../pages/Login/Login";
import NotFound from "../pages/NotFound";

import TenantLoader from "../features/tenant/TenantLoader";

import Wishlist from "../pages/Wishlist/Wishlist";
import Cart from "../pages/Cart/Cart";
import ProductDetails from "../pages/ProductDetails/ProductDetails";
import Checkout from "../pages/Checkout/Checkout";
import Profile from "../pages/Profile/Profile";

/* ADMIN */

import AdminLayout from "../features/admin/components/AdminLayout";
import AdminDashboard from "../features/admin/pages/AdminDashboard";
import AdminTenants from "../features/admin/pages/TenantsPage";
import AdminTenant from "../features/admin/pages/AdminTenant";
import EditTenant from "../features/admin/pages/EditTenant";
import CreateTenant from "../features/admin/pages/CreateTenant";
import AdminTenantProducts from "../features/admin/pages/AdminTenantProducts";
import CreateProduct from "../features/admin/pages/CreateProduct";
import Register from "../pages/Register/Register";
import Logout from "../pages/Logout/Logout";

export const router = createBrowserRouter([
  /* =====================================================
     ADMIN
  ===================================================== */

  {
    path: "/admin",
    element: <AdminLayout />,
    children: [
      /* =================================================
         DASHBOARD
      ================================================= */

      {
        index: true,
        element: <AdminDashboard />,
      },

      /* =================================================
         TENANTS
      ================================================= */

      {
        path: "tenants",
        children: [
          /* TENANT LIST */

          {
            index: true,
            element: <AdminTenants />,
          },

          /* CREATE TENANT */

          {
            path: "create",
            element: <CreateTenant />,
          },

          /* =================================================
             TENANT DETAILS
             /admin/tenants/TENANT003
          ================================================= */

          {
            path: ":tenantId",
            element: <AdminTenant />,
          },

          /* =================================================
             EDIT TENANT
             /admin/tenants/TENANT003/edit
          ================================================= */

          {
            path: ":tenantId/edit",
            element: <EditTenant />,
          },

          /* =================================================
             TENANT PRODUCTS
             /admin/tenants/TENANT003/products
          ================================================= */

          {
            path: ":tenantId/products",
            element: <AdminTenantProducts />,
          },

          /* =================================================
             CREATE PRODUCT
             /admin/tenants/TENANT003/products/create
          ================================================= */

          {
            path: ":tenantId/products/create",
            element: <CreateProduct />,
          },
        ],
      },
    ],
  },

  /* =====================================================
     STORE
  ===================================================== */

  {
    path: "/:tenantSlug",
    element: <TenantLoader />,
    children: [
      {
        element: <MainLayout />,
        children: [
          /* HOME */

          {
            index: true,
            element: <Home />,
          },

          /* PRODUCTS */

          {
            path: "products",
            element: <Products />,
          },

          /* PRODUCT DETAILS */

          {
            path: "product-details/:productId",
            element: <ProductDetails />,
          },

          /* WISHLIST */

          {
            path: "wishlist",
            element: <Wishlist />,
          },

          /* CART */

          {
            path: "cart",
            element: <Cart />,
          },

          /* CHECKOUT */

          {
            path: "checkout",
            element: <Checkout />,
          },

          /* PROFILE */

          {
            path: "profile",
            element: <Profile />,
          },
        ],
      },
    ],
  },
  {
    path: "/admin/login",
    element: <Login />,
  },
  {
    path: "/register",
    element: <Register />,
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