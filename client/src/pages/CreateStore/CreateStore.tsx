import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux";
import { SeoHead } from "../../features/seo";
import {
  registerStoreApi,
  sendStoreSignupOtpApi,
} from "../../features/tenant/api/registerStore.api";
import { loginSuccess } from "../../features/auth/authSlice";
import {
  formatStorefrontHost,
} from "../../features/tenant/tenantHost";
import {
  BUSINESS_TYPE_OPTIONS,
  type BusinessType,
} from "../../constants/businessTypes";
import {
  getApiErrorMessage,
  normalizeTenantId,
  slugifyTenantValue,
} from "../../features/admin/utils/tenantForm.utils";
import styles from "./CreateStore.module.css";
import BrandMark from "../../components/BrandMark/BrandMark";

export default function CreateStore() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [step, setStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType | "">("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const handleNameChange = (value: string) => {
    setName(value);
    setSlug(slugifyTenantValue(value));
  };

  const validateDetails = (): boolean => {
    const cleanSlug = normalizeTenantId(slug);
    if (!name.trim() || name.trim().length < 2) {
      setError("Store name is required.");
      return false;
    }
    if (!cleanSlug || cleanSlug.length < 2) {
      setError("Choose a store URL of at least 2 characters.");
      return false;
    }
    if (!businessType) {
      setError("Select a business type: retail, service, or menu.");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return false;
    }
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      setError("Enter a WhatsApp number with country code, for example 9198XXXXXXXX.");
      return false;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    return true;
  };

  const handleSendOtp = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!validateDetails()) {
      return;
    }

    setLoading(true);
    try {
      const response = await sendStoreSignupOtpApi({
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
      });
      setNotice(
        response.message || "We sent a verification code to WhatsApp.",
      );
      setOtp("");
      setStep("otp");
    } catch (submitError: unknown) {
      setError(
        getApiErrorMessage(submitError, "Could not send the verification code."),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStore = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanSlug = normalizeTenantId(slug);
    const code = otp.replace(/\D/g, "");
    if (code.length !== 6) {
      setError("Enter the 6-digit code from WhatsApp.");
      return;
    }
    if (!businessType) {
      setError("Select a business type: retail, service, or menu.");
      return;
    }

    setLoading(true);
    try {
      const response = await registerStoreApi({
        name: name.trim(),
        slug: cleanSlug,
        businessType,
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        password,
        otp: code,
      });
      if (!response.success || !response.access_token) {
        setError(response.message || "Could not create your store.");
        return;
      }
      dispatch(loginSuccess({ accessToken: response.access_token }));
      navigate(`/admin/tenants/${response.tenantId}/products/create`, {
        replace: true,
      });
    } catch (submitError: unknown) {
      setError(
        getApiErrorMessage(submitError, "Could not create your store."),
      );
    } finally {
      setLoading(false);
    }
  };

  const previewHost = formatStorefrontHost(slug || "your-store");

  return (
    <div className={styles.page}>
      <SeoHead
        title="Create your store | Retail Cosmos"
        description="Launch your own multi-tenant storefront on Retail Cosmos in minutes — pick a URL, manage catalog and orders, and go live."
        path="/create-store"
        image="/images/welcome/demo-store.jpg"
      />
      <header className={styles.top}>
        <Link to="/" className={styles.brand}>
          <BrandMark className={styles.brandMark} />
          Retail Cosmos
        </Link>
        <Link to="/admin/login" className={styles.topLink}>
          Already have a store? Sign in
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.intro}>
          <p className={styles.eyebrow}>Merchant signup</p>
          <h1 className={styles.title}>
            {step === "otp" ? "Verify WhatsApp" : "Create your store"}
          </h1>
          <p className={styles.lead}>
            {step === "otp" ? (
              <>
                Enter the 6-digit code we sent on WhatsApp to{" "}
                <span className={styles.mono}>{phone.trim()}</span>
                . Then we&apos;ll open your admin for{" "}
                <span className={styles.mono}>{previewHost}</span>.
              </>
            ) : (
              <>
                Pick a name, URL, and business type. We&apos;ll send a WhatsApp
                code to confirm it&apos;s you — shoppers visit{" "}
                <span className={styles.mono}>{previewHost}</span>.
              </>
            )}
          </p>
        </div>

        {step === "details" ? (
          <form className={styles.form} onSubmit={handleSendOtp} noValidate>
            {error ? <p className={styles.error}>{error}</p> : null}

            <label className={styles.label}>
              Store name
              <input
                className={styles.input}
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Your Store"
                autoComplete="organization"
                required
              />
            </label>

            <label className={styles.label}>
              Store URL
              <div className={styles.slugRow}>
                <span className={styles.slugPrefix}>/</span>
                <input
                  className={styles.input}
                  value={slug}
                  onChange={(e) => setSlug(normalizeTenantId(e.target.value))}
                  placeholder="your-store"
                  autoComplete="off"
                  required
                />
              </div>
              <span className={styles.hint}>
                Live at {previewHost}
                {slug ? (
                  <>
                    {" "}
                    ·{" "}
                    <Link to={`/${slug}`} className={styles.hintLink}>
                      preview path
                    </Link>
                  </>
                ) : null}
              </span>
            </label>

            <fieldset className={styles.typeFieldset}>
              <legend className={styles.typeLegend}>
                Business type <span aria-hidden="true">*</span>
              </legend>
              <div
                className={styles.typeOptions}
                role="radiogroup"
                aria-label="Business type"
              >
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={`${styles.typeOption} ${
                      businessType === option.value ? styles.typeOptionSelected : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="businessType"
                      value={option.value}
                      checked={businessType === option.value}
                      onChange={() => setBusinessType(option.value)}
                    />
                    <span className={styles.typeLabel}>{option.label}</span>
                    <span className={styles.typeHint}>{option.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className={styles.label}>
              Admin email
              <input
                className={styles.input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                required
              />
            </label>

            <label className={styles.label}>
              WhatsApp number
              <input
                className={styles.input}
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9198XXXXXXXX"
                autoComplete="tel"
                required
              />
              <span className={styles.hint}>
                We send the 6-digit signup code here. Include country code (91 for India).
              </span>
            </label>

            <label className={styles.label}>
              Password
              <input
                className={styles.input}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>

            <label className={styles.label}>
              Confirm password
              <input
                className={styles.input}
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={6}
              />
            </label>

            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? "Sending code…" : "Send verification code"}
            </button>
          </form>
        ) : (
          <form className={styles.form} onSubmit={handleCreateStore} noValidate>
            {error ? <p className={styles.error}>{error}</p> : null}
            {notice ? <p className={styles.notice}>{notice}</p> : null}

            <label className={styles.label}>
              Verification code
              <input
                className={`${styles.input} ${styles.otpInput}`}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                required
              />
            </label>

            <button className={styles.submit} type="submit" disabled={loading}>
              {loading ? "Creating store…" : "Verify and create store"}
            </button>
            <div className={styles.otpActions}>
              <button
                type="button"
                className={styles.textButton}
                disabled={loading}
                onClick={() => {
                  setStep("details");
                  setError("");
                  setNotice("");
                }}
              >
                Edit store details
              </button>
              <button
                type="button"
                className={styles.textButton}
                disabled={loading}
                onClick={(event) => {
                  void handleSendOtp(event);
                }}
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
