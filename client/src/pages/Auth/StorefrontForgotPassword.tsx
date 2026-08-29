import ForgotPasswordPage from "../Auth/ForgotPasswordPage";
import { useStorefrontTenant } from "../../features/tenant/useTenant";

export default function StorefrontForgotPassword() {
    const { tenantId, tenantSlug } = useStorefrontTenant();

    if (!tenantId || !tenantSlug) {
        return <h1>Store not found</h1>;
    }

    return (
        <ForgotPasswordPage
            mode="storefront"
            tenantId={tenantId}
            loginPath={`/${tenantSlug}/login`}
        />
    );
}
