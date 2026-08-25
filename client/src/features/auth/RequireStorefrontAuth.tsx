import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { useStorefrontTenant } from "../tenant/useTenant";

export default function RequireStorefrontAuth({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { tenantSlug } = useStorefrontTenant();
  const loginPath = tenantSlug ? `/${tenantSlug}/login` : "/login";
  if (!isAuthenticated || !user?._id || user.role !== "customer") {
    return (
      <Navigate
        to={loginPath}
        replace
        state={{ from: location.pathname }}
      />
    );
  }
  return children;
}
