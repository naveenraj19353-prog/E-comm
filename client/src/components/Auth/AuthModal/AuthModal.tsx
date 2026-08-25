import { useState } from "react";
import { X } from "lucide-react";
import styles from "./AuthModal.module.css";
import LoginForm from "../LoginForm/LoginForm";
import RegisterForm from "../RegisterForm/RegisterForm";
interface AuthModalProps {
    tenantId: string;
    onClose: () => void;
    onSuccess: () => void;
}
export type AuthMode = "login" | "register";
const AuthModal = ({ tenantId, onClose, onSuccess }: AuthModalProps) => {
    const [mode, setMode] = useState<AuthMode>("login");
    return (<div className={styles.overlay} onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
                onClose();
            }
        }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
          <X size={20}/>
        </button>
        {mode === "login" ? (<LoginForm tenantId={tenantId} onSuccess={onSuccess} onSwitchToRegister={() => setMode("register")}/>) : (<RegisterForm tenantId={tenantId} onSwitchToLogin={() => setMode("login")}/>)}
      </div>
    </div>);
};
export default AuthModal;
