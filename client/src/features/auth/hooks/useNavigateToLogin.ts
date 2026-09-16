import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
    getLoginLocationState,
    getStorefrontLoginPath,
    resolveLoginReturnPath,
} from "../loginRedirect";
import { useStorefrontTenant } from "../../tenant/useTenant";
import { useStorefrontAuthModal } from "../../tenant/StorefrontAuthModal";
import { storefrontNavigate } from "../../../routes/routes";

/**
 * Opens the storefront login popup when available (same page after login).
 * Falls back to the login route outside MainLayout.
 */
export function useNavigateToLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantSlug } = useStorefrontTenant();
    const authModal = useStorefrontAuthModal();

    return useCallback((returnPath?: string, onSuccess?: () => void) => {
        // Prefer in-page modal so shoppers stay on the product/list page.
        if (typeof authModal?.openLogin === "function") {
            authModal.openLogin({ onSuccess });
            return;
        }

        const from = resolveLoginReturnPath(returnPath, location, location.state);
        storefrontNavigate(navigate, getStorefrontLoginPath(tenantSlug), {
            state: getLoginLocationState(from),
        });
    }, [authModal, location, navigate, tenantSlug]);
}
