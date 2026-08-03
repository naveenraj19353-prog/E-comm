import { createBrowserRouter } from "react-router-dom";
import { authRoutes } from "../routes/auth.routes";
import { customerRoutes } from "../routes/customer.routes";
import { adminRoutes } from "../routes/admin.routes";
;

export const router = createBrowserRouter([
  ...authRoutes,
  ...customerRoutes,
  ...adminRoutes,
]);