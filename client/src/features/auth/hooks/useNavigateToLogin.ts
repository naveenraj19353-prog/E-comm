import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getLoginLocationState,
    getReturnPath,
    getStorefrontLoginPath,
    readLoginReturnPath,
} from "../loginRedirect";
import { useStorefrontTenant } from "../../tenant/useTenant";

export function useNavigateToLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    return useCallback((returnPath?: string) => {
        const from =
            returnPath ||
            readLoginReturnPath(location.state) ||
            getReturnPath(location);
        navigate(getStorefrontLoginPath(tenantSlug), {
            state: getLoginLocationState(from),
        });
    }, [navigate, location, tenantSlug]);
}
