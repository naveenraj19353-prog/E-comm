import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
export default function Logout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  useEffect(() => {
    logout();
    const slug = localStorage.getItem("ecommerce_tenantSlug");
    navigate(slug ? `/${slug}/login` : "/admin/login", { replace: true });
  }, []);
  return null;
}
