import { useNavigate } from "react-router-dom";
import LoginForm from "../../components/Auth/LoginForm/LoginForm";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import styles from "../../styles/Auth.module.css";

export default function StorefrontLogin() {
  const navigate = useNavigate();
  const { tenantId, tenantSlug, tenant } = useStorefrontTenant();
  const { user } = useAuth();

  const handleSuccess = () => {
    const stored = localStorage.getItem("ecommerce_auth");
    if (!stored) {
      navigate(`/${tenantSlug}`, { replace: true });
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      const role = parsed?.user?.role;
      const adminTenantId = parsed?.user?.tenantId;
      if (role === "super_admin") {
        navigate("/admin", { replace: true });
        return;
      }
      if (role === "admin" && adminTenantId) {
        navigate(`/admin/tenants/${adminTenantId}`, { replace: true });
        return;
      }
    } catch {
      // Fall through to storefront home.
    }
    navigate(`/${tenantSlug}`, { replace: true });
  };

  if (!tenantId) {
    return <h1>Store not found</h1>;
  }

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <LoginForm
          tenantId={tenantId}
          onSuccess={handleSuccess}
          onSwitchToRegister={() => navigate(`/${tenantSlug}/register`)}
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
