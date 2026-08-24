import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../features/auth/hooks/useAuth";
export default function Logout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  useEffect(() => {
    logout();
    navigate("/login", { replace: true });
  }, []);
  return null;
}
