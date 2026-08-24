import { useState } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import styles from "../AuthModal/AuthModal.module.css";
import { useAuth } from "../../../features/auth/hooks/useAuth";
interface RegisterFormProps {
  tenantId: string;
  onSwitchToLogin: () => void;
}
const RegisterForm = ({ tenantId, onSwitchToLogin }: RegisterFormProps) => {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your email.");
      return;
    }
    if (!phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }
    if (!password) {
      setError("Please enter a password.");
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
      const response = await register({
        tenantId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });
      if (!response.success) {
        setError("Unable to create account.");
        return;
      }
      onSwitchToLogin();
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      console.error("Registration failed:", error);
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
        <button
          type="button"
          className={styles.backButton}
          onClick={onSwitchToLogin}
        >
          <ArrowLeft size={16} />
          Back to login
        </button>
        <div className={styles.logo}>S</div>
        <h2>Create your account</h2>
        <p>Join us and start shopping today.</p>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label htmlFor="register-name">Full name</label>
          <input
            id="register-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Naveen Kumar"
            autoComplete="name"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-phone">Phone</label>
          <input
            id="register-phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="9876543210"
            autoComplete="tel"
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="register-password">Password</label>
          <div className={styles.passwordWrapper}>
            <input
              id="register-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
            />
            <button
              type="button"
              className={styles.eyeButton}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className={styles.field}>
          <label htmlFor="register-confirm-password">Confirm password</label>
          <input
            id="register-confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter password"
            autoComplete="new-password"
          />
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <div className={styles.switchText}>
        <span>Already have an account?</span>
        <button type="button" onClick={onSwitchToLogin}>
          Login
        </button>
      </div>
    </>
  );
};
export default RegisterForm;
