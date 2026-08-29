import LoginForm from "../../components/Auth/LoginForm/LoginForm";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useAuthPageSwitch } from "../../features/auth/hooks/useAuthPageSwitch";
import { usePostLoginRedirect } from "../../features/auth/hooks/usePostLoginRedirect";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import styles from "../../styles/Auth.module.css";

export default function StorefrontLogin() {
    const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
    const { user } = useAuth();
    const redirectAfterLogin = usePostLoginRedirect();
    const { goToRegister } = useAuthPageSwitch();

    if (!tenantId) {
        return <h1>Store not found</h1>;
    }

    return (
        <div className={styles.authPage}>
            <div className={styles.authCard}>
                <LoginForm
                    tenantId={tenantId}
                    tenantSlug={tenantSlug}
                    onSuccess={redirectAfterLogin}
                    onSwitchToRegister={goToRegister}
                />
                {user?.role === "customer" ? null : (
                    <p className={styles.footer}>
                        {tenant?.name || tenantSlug} customer login
                    </p>
                )}
            </div>
        </div>
    );
}
