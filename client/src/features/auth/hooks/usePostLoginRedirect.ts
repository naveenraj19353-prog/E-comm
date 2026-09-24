import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    readLoginReturnPath,
    resolvePostLoginPath,
} from "../loginRedirect";
import { getLastIssuedAccessToken, getStoredAccessToken, getUserFromAccessToken } from "../token";
import { useStorefrontTenant } from "../../tenant/useTenant";

export function usePostLoginRedirect() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    return useCallback(() => {
        const from = readLoginReturnPath(location.state);
        // A staff login on the storefront form is saved to the admin session,
        // not this store's, so use the token that was just issued.
        const token = getLastIssuedAccessToken() || getStoredAccessToken();
        const user = token ? getUserFromAccessToken(token) : null;
        navigate(resolvePostLoginPath(user, from, tenantSlug), { replace: true });
    }, [location.state, navigate, tenantSlug]);
}
