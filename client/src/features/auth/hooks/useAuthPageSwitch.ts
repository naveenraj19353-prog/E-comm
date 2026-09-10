import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getLoginLocationState,
    readLoginReturnPath,
    resolveStorefrontReturnPath,
} from "../loginRedirect";
import { useStorefrontTenant } from "../../tenant/useTenant";
import { routes, storefrontNavigate } from "../../../routes/routes";

export function useAuthPageSwitch() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    const goToRegister = useCallback(() => {
        const from = readLoginReturnPath(location.state);
        storefrontNavigate(navigate, routes.register(tenantSlug), {
            state: from ? getLoginLocationState(from) : undefined,
        });
    }, [location.state, navigate, tenantSlug]);

    const goToLogin = useCallback(() => {
        const from = readLoginReturnPath(location.state);
        storefrontNavigate(navigate, routes.login(tenantSlug), {
            state: getLoginLocationState(resolveStorefrontReturnPath(from, tenantSlug)),
        });
    }, [location.state, navigate, tenantSlug]);

    return { goToRegister, goToLogin };
}
