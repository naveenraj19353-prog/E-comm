import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    readLoginReturnPath,
    resolvePostLoginPath,
} from "../loginRedirect";
import { getStoredAccessToken, getUserFromAccessToken } from "../token";
import { useStorefrontTenant } from "../../tenant/useTenant";

export function usePostLoginRedirect() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    return useCallback(() => {
        const from = readLoginReturnPath(location.state);
        const token = getStoredAccessToken();
        const user = token ? getUserFromAccessToken(token) : null;
        navigate(resolvePostLoginPath(user, from, tenantSlug), { replace: true });
    }, [location.state, navigate, tenantSlug]);
}
