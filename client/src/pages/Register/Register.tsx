import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import styles from "../../styles/Auth.module.css";

import { useAuth } from "../../features/auth/hooks/useAuth";

export default function Register() {
  const navigate = useNavigate();

  const { register } = useAuth();

  const [tenantId, setTenantId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!tenantId.trim()) {
      setError("Tenant ID is required.");
      return;
    }

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      const response = await register({
        tenantId: tenantId.trim(),
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
      });

      if (!response.success) {
        setError("Registration failed.");
        return;
      }

      setSuccess("Registration successful. Redirecting to login...");

      setTimeout(() => {
        navigate("/login", { replace: true });
      }, 1200);
    } catch (err: any) {
      console.error("Registration error:", err);

      const message =
        err?.response?.data?.detail ||
        err?.message ||
        "Unable to create your account.";

      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authCard}>
        <div className={styles.authHeader}>
          <div className={styles.logo}>N</div>

          <h1>Create account</h1>

          <p>Register for your store account</p>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        {success && (
          <div className={styles.successMessage}>{success}</div>
        )}

        <form onSubmit={handleSubmit} className={styles.authForm}>
          <div className={styles.formGroup}>
            <label htmlFor="tenantId">Tenant ID</label>

            <input
              id="tenantId"
              type="text"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
              placeholder="TENANT001"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="name">Full Name</label>

            <input
              id="name"
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="email">Email</label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Phone</label>

            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="9876543210"
              autoComplete="tel"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password">Password</label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              autoComplete="new-password"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="confirmPassword">Confirm Password</label>

            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(event) =>
                setConfirmPassword(event.target.value)
              }
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            className={styles.primaryButton}
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <div className={styles.authFooter}>
          <span>Already have an account?</span>

          <Link to="/login">Sign in</Link>
        </div>
      </div>
    </div>
  );
}