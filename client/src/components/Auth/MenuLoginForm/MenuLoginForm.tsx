import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "../AuthModal/AuthModal.module.css";
import { useAuth } from "../../../features/auth/hooks/useAuth";
import axios from "axios";

interface MenuLoginFormProps {
    tenantId: string;
    onSuccess: () => void;
}

const MenuLoginForm = ({ tenantId, onSuccess }: MenuLoginFormProps) => {
    const { menuLogin } = useAuth();
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [counterNumber, setCounterNumber] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        if (!phone.trim()) {
            setError("Please enter your mobile number.");
            return;
        }
        if (!password.trim()) {
            setError("Please enter the hotel password.");
            return;
        }
        if (!counterNumber.trim()) {
            setError("Please enter your table / room number.");
            return;
        }
        try {
            setLoading(true);
            const response = await menuLogin({
                tenantId,
                phone: phone.trim(),
                password: password.trim(),
                counterNumber: counterNumber.trim(),
            });
            if (!response.success) {
                setError("Unable to sign in.");
                return;
            }
            onSuccess();
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                const detail = error.response?.data?.detail;
                setError(
                    typeof detail === "string"
                        ? detail
                        : "Invalid mobile or daily password.",
                );
            } else {
                setError("Invalid mobile or daily password.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className={styles.header}>
                <div className={styles.logo}>M</div>
                <h2 id="auth-modal-title">Table login</h2>
                <p>
                    Enter your mobile, today’s hotel password, and your table or
                    room number.
                </p>
            </div>
            {error ? <div className={styles.error}>{error}</div> : null}
            <form className={styles.form} onSubmit={handleSubmit}>
                <div className={styles.field}>
                    <label htmlFor="menu-phone">Mobile number</label>
                    <input
                        id="menu-phone"
                        type="tel"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        placeholder="9876543210"
                        autoComplete="tel"
                    />
                </div>
                <div className={styles.field}>
                    <label htmlFor="menu-password">Daily password</label>
                    <div className={styles.passwordWrapper}>
                        <input
                            id="menu-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder="Ask staff for today’s password"
                            autoComplete="one-time-code"
                        />
                        <button
                            type="button"
                            className={styles.eyeButton}
                            onClick={() => setShowPassword((value) => !value)}
                            aria-label={
                                showPassword ? "Hide password" : "Show password"
                            }
                        >
                            {showPassword ? (
                                <EyeOff size={18} />
                            ) : (
                                <Eye size={18} />
                            )}
                        </button>
                    </div>
                </div>
                <div className={styles.field}>
                    <label htmlFor="menu-counter">Table / room number</label>
                    <input
                        id="menu-counter"
                        type="text"
                        value={counterNumber}
                        onChange={(event) => setCounterNumber(event.target.value)}
                        placeholder="e.g. 12 or A-204"
                        autoComplete="off"
                    />
                </div>
                <button
                    type="submit"
                    className={styles.primaryButton}
                    disabled={loading}
                >
                    {loading ? "Signing in..." : "Continue"}
                </button>
            </form>
        </>
    );
};

export default MenuLoginForm;
