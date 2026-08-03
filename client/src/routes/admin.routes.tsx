import AdminDashboard from "../pages/admin/Dashboard/Dashboard";
import Orders from "../pages/admin/Orders/Orders";
import Products from "../pages/admin/Products/Products";
import { PATH } from "./path";

export const adminRoutes = [
    {
      path: PATH.ADMIN,
      element: <AdminDashboard />,
    },
    {
      path: PATH.ADMIN_PRODUCTS,
      element: <Products />,
    },
    {
      path: PATH.ADMIN_ORDERS,
      element: <Orders />,
    },
  ];