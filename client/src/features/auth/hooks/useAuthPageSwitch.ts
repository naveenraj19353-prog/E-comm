import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getLoginLocationState,
    readLoginReturnPath,
    resolveStorefrontReturnPath,
} from "../loginRedirect";
import { useStorefrontTenant } from "../../tenant/useTenant";

export function useAuthPageSwitch() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();

    const goToRegister = useCallback(() => {
        const from = readLoginReturnPath(location.state);
        navigate(`/${tenantSlug}/register`, {
            state: from ? getLoginLocationState(from) : undefined,
        });
    }, [location.state, navigate, tenantSlug]);

    const goToLogin = useCallback(() => {
        const from = readLoginReturnPath(location.state);
        navigate(`/${tenantSlug}/login`, {
            state: getLoginLocationState(resolveStorefrontReturnPath(from, tenantSlug)),
        });
    }, [location.state, navigate, tenantSlug]);

    return { goToRegister, goToLogin };
}
