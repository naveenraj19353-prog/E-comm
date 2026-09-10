import ResetPasswordPage from "./ResetPasswordPage";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { routes } from "../../routes/routes";

export default function StorefrontResetPassword() {
    const { tenantSlug } = useStorefrontTenant();

    return (
        <ResetPasswordPage
            defaultLoginPath={
                tenantSlug ? routes.login(tenantSlug) : "/login"
            }
        />
    );
}
