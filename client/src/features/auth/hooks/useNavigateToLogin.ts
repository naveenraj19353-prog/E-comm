import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getLoginLocationState,
    getStorefrontLoginPath,
    resolveLoginReturnPath,
} from "../loginRedirect";
import { useStorefrontTenant } from "../../tenant/useTenant";

export function useNavigateToLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    return useCallback((returnPath?: string) => {
        const from = resolveLoginReturnPath(returnPath, location, location.state);
        navigate(getStorefrontLoginPath(tenantSlug), {
            state: getLoginLocationState(from),
        });
    }, [location, navigate, tenantSlug]);
}
