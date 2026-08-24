import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "../AuthModal/AuthModal.module.css";
import { useAuth } from "../../../features/auth/hooks/useAuth";
interface LoginFormProps {
  tenantId: string;
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}
const LoginForm = ({
  tenantId,
  onSuccess,
  onSwitchToRegister,
}: LoginFormProps) => {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    try {
      setLoading(true);
      const response = await login({
        tenantId,
        email: email.trim(),
        password,
      });
      if (!response.success) {
        setError("Unable to login.");
        return;
      }
      onSuccess();
    } catch (error: unknown) {
      console.error("Login failed:", error);
      if (error instanceof Error) {
        setError(error.message || "Invalid email or password.");
      } else {
        setError("Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <div className={styles.header}>
        <div className={styles.logo}>S</div>
        <h2 id="auth-modal-title">Welcome back</h2>
        <p>Login to continue shopping and write reviews.</p>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor="login-password">Password</label>
            <button type="button" className={styles.forgotButton}>
              Forgot password?
            </button>
          </div>
          <div className={styles.passwordWrapper}>
            <input
              id="login-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
            />
            <button
              type="button"
              className={styles.eyeButton}
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={loading}
        >
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
      <div className={styles.switchText}>
        <span>Don't have an account?</span>
        <button type="button" onClick={onSwitchToRegister}>
          Create account
        </button>
      </div>
    </>
  );
};
export default LoginForm;
