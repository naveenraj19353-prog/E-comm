import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { getLoginLocationState, getReturnPath, getStorefrontLoginPath, } from "./loginRedirect";
import { useStorefrontTenant } from "../tenant/useTenant";

export default function RequireStorefrontAuth({
  children,
  allowGuest = false,
}: {
  children: ReactNode;
  /** Render the page for signed-out shoppers too (it handles sign-in inline, e.g. checkout). */
  allowGuest?: boolean;
}) {
  const location = useLocation();
  const { isAuthenticated, user } = useAuth();
  const { tenantSlug } = useStorefrontTenant();
  const loginPath = getStorefrontLoginPath(tenantSlug);
  const isCustomer = isAuthenticated && Boolean(user?._id) && user?.role === "customer";
  if (!isCustomer && !allowGuest) {
    if (/^https?:\/\//i.test(loginPath)) {
      window.location.assign(loginPath);
      return null;
    }
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
