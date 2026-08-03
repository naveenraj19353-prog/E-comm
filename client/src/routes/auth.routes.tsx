import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import AuthLayout from "../pages/layouts/AuthLayout/AuthLayout";
import { PATH } from "./path";

 export const authRoutes = [
  {
    path: "/:tenant",
    element: <AuthLayout />,
    children: [
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "register",
        element: <Register />,
      },
    ],
  },
];