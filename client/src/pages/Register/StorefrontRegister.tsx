import RegisterForm from "../../components/Auth/RegisterForm/RegisterForm";
import { useAuthPageSwitch } from "../../features/auth/hooks/useAuthPageSwitch";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import styles from "../../styles/Auth.module.css";

export default function StorefrontRegister() {
    const { tenantId } = useStorefrontTenant();
    const { goToLogin } = useAuthPageSwitch();

    if (!tenantId) {
        return <h1>Store not found</h1>;
    }

    return (
        <div className={styles.authPage}>
            <div className={styles.authCard}>
                <RegisterForm tenantId={tenantId} onSwitchToLogin={goToLogin} />
            </div>
        </div>
    );
}
