import { useLocation, useNavigate } from "react-router-dom";
import RegisterForm from "../../components/Auth/RegisterForm/RegisterForm";
import {
    getLoginLocationState,
    readLoginReturnPath,
    resolveStorefrontReturnPath,
} from "../../features/auth/loginRedirect";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import styles from "../../styles/Auth.module.css";

export default function StorefrontRegister() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantId, tenantSlug } = useStorefrontTenant();
    if (!tenantId) {
        return <h1>Store not found</h1>;
    }
    return (<div className={styles.authPage}>
      <div className={styles.authCard}>
        <RegisterForm tenantId={tenantId} onSwitchToLogin={() => {
            const from = readLoginReturnPath(location.state);
            navigate(`/${tenantSlug}/login`, {
                state: getLoginLocationState(resolveStorefrontReturnPath(from, tenantSlug)),
            });
        }}/>
      </div>
    </div>);
}
