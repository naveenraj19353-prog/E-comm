import { Navigate } from "react-router-dom";
interface LegacyAuthRedirectProps {
    mode: "login" | "register";
}
export default function LegacyAuthRedirect({ mode }: LegacyAuthRedirectProps) {
    const slug = localStorage.getItem("ecommerce_tenantSlug");
    if (slug) {
        return <Navigate to={`/${slug}/${mode}`} replace/>;
    }
    return <Navigate to="/admin/login" replace/>;
}
