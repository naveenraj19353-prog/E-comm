import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import { ArrowLeft } from "lucide-react";
import modalStyles from "../../../components/Auth/AuthModal/AuthModal.module.css";
import styles from "./PhoneOtpForm.module.css";
import { useAuth } from "../hooks/useAuth";

interface PhoneOtpFormProps {
    tenantId: string;
    onSuccess: () => void;
    /** Shows a "Use email instead" link. */
    onUseEmail?: () => void;
    title?: string;
    subtitle?: string;
    /** Hide the big centered header (e.g. inside a checkout card). */
    compact?: boolean;
    submitLabel?: string;
}

const CODE_LENGTH = 6;

function errorMessage(error: unknown, fallback: string): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === "string" && detail.trim()) {
            return detail;
        }
        if (error.response?.status === 422) {
            return "Check the number and code and try again.";
        }
    }
    return fallback;
}

/**
 * Phone sign-in for a storefront: number → 6-digit WhatsApp code → signed in.
 * New numbers get an account created quietly, so this doubles as guest checkout.
 */
export default function PhoneOtpForm({
    tenantId,
    onSuccess,
    onUseEmail,
    title = "Continue with phone",
    subtitle = "We'll send a 6-digit code to your WhatsApp.",
    compact = false,
    submitLabel = "Verify and continue",
}: PhoneOtpFormProps) {
    const { sendPhoneOtp, verifyPhoneOtp } = useAuth();
    const [step, setStep] = useState<"phone" | "code">("phone");
    const [phone, setPhone] = useState("");
    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [resendIn, setResendIn] = useState(0);

    useEffect(() => {
        if (resendIn <= 0) {
            return;
        }
        const timer = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
        return () => window.clearTimeout(timer);
    }, [resendIn]);

    const sendCode = async () => {
        setError("");
        const digits = phone.replace(/\D/g, "");
        if (digits.length < 10) {
            setError("Enter your 10-digit mobile number.");
            return;
        }
        try {
            setLoading(true);
            const response = await sendPhoneOtp({ tenantId, phone: phone.trim() });
            setNotice(response.message);
            setResendIn(response.resendInSeconds ?? 45);
            setCode("");
            setStep("code");
        }
        catch (sendError) {
            setError(errorMessage(sendError, "Could not send the code. Try again."));
        }
        finally {
            setLoading(false);
        }
    };

    const handlePhoneSubmit = (event: FormEvent) => {
        event.preventDefault();
        void sendCode();
    };

    const handleCodeSubmit = async (event: FormEvent) => {
        event.preventDefault();
        setError("");
        const digits = code.replace(/\D/g, "");
        if (digits.length !== CODE_LENGTH) {
            setError("Enter the 6-digit code from WhatsApp.");
            return;
        }
        try {
            setLoading(true);
            const response = await verifyPhoneOtp({
                tenantId,
                phone: phone.trim(),
                otp: digits,
                name: name.trim() || undefined,
            });
            if (!response.success || !response.access_token) {
                setError("Could not sign you in. Try again.");
                return;
            }
            onSuccess();
        }
        catch (verifyError) {
            setError(errorMessage(verifyError, "Invalid code. Try again."));
        }
        finally {
            setLoading(false);
        }
    };

    return (
        <>
            {compact ? null : (
                <div className={modalStyles.header}>
                    <div className={modalStyles.logo}>S</div>
                    <h2 id="auth-modal-title">{title}</h2>
                    <p>{subtitle}</p>
                </div>
            )}
            {error && <div className={modalStyles.error} role="alert">{error}</div>}
            {step === "phone" ? (
                <form className={modalStyles.form} onSubmit={handlePhoneSubmit}>
                    <div className={modalStyles.field}>
                        <label htmlFor="otp-phone">WhatsApp number</label>
                        <input
                            id="otp-phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="98765 43210"
                        />
                    </div>
                    <button type="submit" className={modalStyles.primaryButton} disabled={loading}>
                        {loading ? "Sending code..." : "Send code on WhatsApp"}
                    </button>
                </form>
            ) : (
                <form className={modalStyles.form} onSubmit={handleCodeSubmit}>
                    <button
                        type="button"
                        className={modalStyles.backButton}
                        onClick={() => {
                            setStep("phone");
                            setError("");
                            setNotice("");
                        }}
                    >
                        <ArrowLeft size={14} /> Change number
                    </button>
                    {notice && <div className={styles.notice} role="status">{notice}</div>}
                    <div className={modalStyles.field}>
                        <label htmlFor="otp-code">6-digit code</label>
                        <input
                            id="otp-code"
                            className={styles.codeInput}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={CODE_LENGTH}
                            value={code}
                            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                            placeholder="••••••"
                            autoFocus
                        />
                    </div>
                    <div className={modalStyles.field}>
                        <label htmlFor="otp-name">Your name (optional)</label>
                        <input
                            id="otp-name"
                            type="text"
                            autoComplete="name"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="For your orders"
                            maxLength={100}
                        />
                    </div>
                    <button type="submit" className={modalStyles.primaryButton} disabled={loading}>
                        {loading ? "Verifying..." : submitLabel}
                    </button>
                    <div className={styles.row}>
                        <p className={styles.hint}>Didn't get it?</p>
                        <button
                            type="button"
                            className={modalStyles.forgotButton}
                            disabled={loading || resendIn > 0}
                            onClick={() => void sendCode()}
                        >
                            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                        </button>
                    </div>
                </form>
            )}
            {onUseEmail ? (
                <div className={modalStyles.switchText}>
                    <span>Have a password?</span>
                    <button type="button" onClick={onUseEmail}>
                        Sign in with email
                    </button>
                </div>
            ) : null}
        </>
    );
}
