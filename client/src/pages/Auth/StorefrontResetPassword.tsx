import ResetPasswordPage from "./ResetPasswordPage";
import { useStorefrontTenant } from "../../features/tenant/useTenant";

export default function StorefrontResetPassword() {
    const { tenantSlug } = useStorefrontTenant();

    return (
        <ResetPasswordPage
            defaultLoginPath={
                tenantSlug ? `/${tenantSlug}/login` : "/login"
            }
        />
    );
}
