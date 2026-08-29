import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { getLoginLocationState, getReturnPath, getStorefrontLoginPath, } from "./loginRedirect";
import { useStorefrontTenant } from "../tenant/useTenant";

export default function RequireStorefrontAuth({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { tenantSlug } = useStorefrontTenant();
  const loginPath = getStorefrontLoginPath(tenantSlug);
  if (!isAuthenticated || !user?._id || user?.role !== "customer") {
    return (
      <Navigate
        to={loginPath}
        replace
        state={getLoginLocationState(getReturnPath(location))}
      />
    );
  }
  return children;
}
