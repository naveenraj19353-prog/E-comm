import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { routes, storefrontNavigate } from "../../routes/routes";

export default function Logout() {
    const navigate = useNavigate();
    const { logout } = useAuth();
    useEffect(() => {
        logout();
        const slug = localStorage.getItem("ecommerce_tenantSlug");
        if (slug) {
            storefrontNavigate(navigate, routes.login(slug), { replace: true });
        }
        else {
            navigate("/admin/login", { replace: true });
        }
    }, []);
    return null;
}
