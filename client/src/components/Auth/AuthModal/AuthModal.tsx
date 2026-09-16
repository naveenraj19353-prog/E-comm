import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./AuthModal.module.css";
import LoginForm from "../LoginForm/LoginForm";
import RegisterForm from "../RegisterForm/RegisterForm";
import MenuLoginForm from "../MenuLoginForm/MenuLoginForm";
import { useStorefrontTenant } from "../../../features/tenant/useTenant";
import { isMenuBusiness } from "../../../features/tenant/businessMode";

interface AuthModalProps {
    tenantId: string;
    onClose: () => void;
    onSuccess: () => void;
}

export type AuthMode = "login" | "register";

const AuthModal = ({ tenantId, onClose, onSuccess }: AuthModalProps) => {
    const [mode, setMode] = useState<AuthMode>("login");
    const { tenant } = useStorefrontTenant();
    const isMenu = isMenuBusiness(tenant?.businessType);

    return createPortal(
        <div
            className={styles.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="auth-modal-title"
            >
                <button
                    type="button"
                    className={styles.closeButton}
                    onClick={onClose}
                    aria-label="Close"
                >
                    <X size={20} />
                </button>
                {!tenantId ? (
                    <div className={styles.header}>
                        <h2 id="auth-modal-title">Unable to sign in</h2>
                        <p>
                            Store context is missing. Refresh the page and try
                            again.
                        </p>
                    </div>
                ) : isMenu ? (
                    <MenuLoginForm tenantId={tenantId} onSuccess={onSuccess} />
                ) : mode === "login" ? (
                    <LoginForm
                        tenantId={tenantId}
                        onSuccess={onSuccess}
                        onSwitchToRegister={() => setMode("register")}
                    />
                ) : (
                    <RegisterForm
                        tenantId={tenantId}
                        onSwitchToLogin={() => setMode("login")}
                        onSuccess={onSuccess}
                    />
                )}
            </div>
        </div>,
        document.body,
    );
};

export default AuthModal;
