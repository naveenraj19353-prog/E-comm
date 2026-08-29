import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { forgotPasswordApi } from "../../features/auth/api/auth.api";
import styles from "../../styles/Auth.module.css";

interface ForgotPasswordPageProps {
    mode: "storefront" | "admin";
    tenantId?: string;
    loginPath: string;
}

export default function ForgotPasswordPage({
    mode,
    tenantId,
    loginPath,
}: ForgotPasswordPageProps) {
    const [adminTenantId, setAdminTenantId] = useState("");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!email.trim()) {
            setError("Please enter your email.");
            return;
        }

        try {
            setLoading(true);
            const resolvedTenantId =
                mode === "storefront"
                    ? tenantId ?? null
                    : adminTenantId.trim() || null;

            const response = await forgotPasswordApi({
                tenantId: resolvedTenantId,
                email: email.trim(),
            });
            setSuccess(
                response.message ||
                    "If an account exists, a reset link has been sent to your email.",
            );
        } catch (submitError: unknown) {
            if (axios.isAxiosError(submitError)) {
                const detail = submitError.response?.data?.detail;
                setError(
                    typeof detail === "string"
                        ? detail
                        : "Unable to send reset link.",
                );
            } else {
                setError("Unable to send reset link.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className={styles.authPage}>
            <section className={styles.authCard}>
                <div className={styles.heading}>
                    <span className={styles.eyebrow}>
                        {mode === "admin" ? "ADMIN PORTAL" : "YOUR ACCOUNT"}
                    </span>
                    <h1>Forgot password?</h1>
                    <p>
                        Enter your email and we&apos;ll send you a link to reset
                        your password.
                    </p>
                </div>

                {error && (
                    <div className={styles.error}>
                        <span>!</span>
                        {error}
                    </div>
                )}

                {success && <div className={styles.notice}>{success}</div>}

                <form className={styles.form} onSubmit={handleSubmit}>
                    {mode === "admin" && (
                        <div className={styles.field}>
                            <label htmlFor="tenantId">Tenant ID</label>
                            <input
                                id="tenantId"
                                type="text"
                                placeholder="Leave empty for Super Admin"
                                value={adminTenantId}
                                onChange={(event) =>
                                    setAdminTenantId(event.target.value)
                                }
                                autoComplete="organization"
                                disabled={loading || Boolean(success)}
                            />
                            <small>
                                Tenant admin: enter your tenant ID. Super admin:
                                leave empty.
                            </small>
                        </div>
                    )}

                    <div className={styles.field}>
                        <label htmlFor="email">Email address</label>
                        <input
                            id="email"
                            type="email"
                            placeholder="you@example.com"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            disabled={loading || Boolean(success)}
                        />
                    </div>

                    <button
                        type="submit"
                        className={styles.loginButton}
                        disabled={loading || Boolean(success)}
                    >
                        {loading ? "Sending..." : "Send reset link"}
                    </button>
                </form>

                <p className={styles.footer}>
                    <Link to={loginPath}>Back to login</Link>
                </p>
            </section>
        </main>
    );
}
