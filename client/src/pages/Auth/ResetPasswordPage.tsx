import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { resetPasswordApi } from "../../features/auth/api/auth.api";
import styles from "../../styles/Auth.module.css";

interface ResetPasswordPageProps {
    defaultLoginPath: string;
}

export default function ResetPasswordPage({
    defaultLoginPath,
}: ResetPasswordPageProps) {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useMemo(
        () => searchParams.get("token")?.trim() || "",
        [searchParams],
    );

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!token) {
            setError("Reset link is invalid or missing.");
            return;
        }
        if (password.length < 6) {
            setError("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        try {
            setLoading(true);
            const response = await resetPasswordApi({
                token,
                password,
            });
            setSuccess(response.message || "Password updated successfully.");
            window.setTimeout(() => {
                navigate(response.loginPath || defaultLoginPath, {
                    replace: true,
                });
            }, 1500);
        } catch (submitError: unknown) {
            if (axios.isAxiosError(submitError)) {
                const detail = submitError.response?.data?.detail;
                setError(
                    typeof detail === "string"
                        ? detail
                        : "Unable to reset password.",
                );
            } else {
                setError("Unable to reset password.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className={styles.authPage}>
            <section className={styles.authCard}>
                <div className={styles.heading}>
                    <span className={styles.eyebrow}>PASSWORD RESET</span>
                    <h1>Set a new password</h1>
                    <p>Choose a strong password for your account.</p>
                </div>

                {error && (
                    <div className={styles.error}>
                        <span>!</span>
                        {error}
                    </div>
                )}

                {success && <div className={styles.notice}>{success}</div>}

                {!token ? (
                    <p className={styles.footer}>
                        This reset link is invalid.{" "}
                        <Link to={defaultLoginPath}>Return to login</Link>
                    </p>
                ) : (
                    <form className={styles.form} onSubmit={handleSubmit}>
                        <div className={styles.field}>
                            <label htmlFor="password">New password</label>
                            <div className={styles.passwordWrapper}>
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                    placeholder="At least 6 characters"
                                    autoComplete="new-password"
                                    disabled={loading || Boolean(success)}
                                />
                                <button
                                    type="button"
                                    className={styles.passwordToggle}
                                    onClick={() =>
                                        setShowPassword((current) => !current)
                                    }
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        <div className={styles.field}>
                            <label htmlFor="confirmPassword">
                                Confirm password
                            </label>
                            <input
                                id="confirmPassword"
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(event) =>
                                    setConfirmPassword(event.target.value)
                                }
                                placeholder="Re-enter your password"
                                autoComplete="new-password"
                                disabled={loading || Boolean(success)}
                            />
                        </div>

                        <button
                            type="submit"
                            className={styles.loginButton}
                            disabled={loading || Boolean(success)}
                        >
                            {loading ? "Updating..." : "Update password"}
                        </button>
                    </form>
                )}

                <p className={styles.footer}>
                    <Link to={defaultLoginPath}>Back to login</Link>
                </p>
            </section>
        </main>
    );
}
