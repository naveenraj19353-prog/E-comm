import { Navigate } from "react-router-dom";
import { routes } from "../../routes/routes";

interface LegacyAuthRedirectProps {
    mode: "login" | "register";
}

export default function LegacyAuthRedirect({ mode }: LegacyAuthRedirectProps) {
    const slug = localStorage.getItem("ecommerce_tenantSlug");
    if (!slug) {
        return <Navigate to="/admin/login" replace/>;
    }
    const to = mode === "login" ? routes.login(slug) : routes.register(slug);
    if (/^https?:\/\//i.test(to)) {
        window.location.replace(to);
        return null;
    }
    return <Navigate to={to} replace/>;
}
