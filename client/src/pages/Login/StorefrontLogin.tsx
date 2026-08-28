import { useLocation, useNavigate } from "react-router-dom";
import LoginForm from "../../components/Auth/LoginForm/LoginForm";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { getStoredAccessToken, getUserFromAccessToken, } from "../../features/auth/token";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import styles from "../../styles/Auth.module.css";
export default function StorefrontLogin() {
    const navigate = useNavigate();
    const location = useLocation();
    const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
    const { user } = useAuth();
    const handleSuccess = () => {
        const from =
            typeof location.state === "object" &&
            location.state &&
            "from" in location.state &&
            typeof location.state.from === "string"
                ? location.state.from
                : "";
        const token = getStoredAccessToken();
        const loggedInUser = token
            ? getUserFromAccessToken(token)
            : null;
        if (!loggedInUser) {
            navigate(`/${tenantSlug}`, { replace: true });
            return;
        }
        if (loggedInUser.role === "super_admin") {
            navigate("/admin", { replace: true });
            return;
        }
        if (loggedInUser.role === "admin" && loggedInUser.tenantId) {
            navigate(`/admin/tenants/${loggedInUser.tenantId}`, { replace: true });
            return;
        }
        if (from.startsWith(`/${tenantSlug}/`)) {
            navigate(from, { replace: true });
            return;
        }
        navigate(`/${tenantSlug}`, { replace: true });
    };
    if (!tenantId) {
        return <h1>Store not found</h1>;
    }
    return (<div className={styles.authPage}>
      <div className={styles.authCard}>
        <LoginForm tenantId={tenantId} onSuccess={handleSuccess} onSwitchToRegister={() => navigate(`/${tenantSlug}/register`)}/>
        {user?.role === "customer" ? null : (<p className={styles.footer}>
            {tenant?.name || tenantSlug} customer login
          </p>)}
      </div>
    </div>);
}
