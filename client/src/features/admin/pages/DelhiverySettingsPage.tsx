import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  createDelhiveryWarehouse,
  getDelhiverySettings,
  saveDelhiverySettings,
  testDelhiveryConnection,
  type DelhiverySettings,
} from "../api/delhivery.api";
import PageLoader from "../../../components/PageLoader";
import styles from "../styles/DelhiverySettings.module.css";

function errorMessage(err: unknown, fallback: string) {
  if (!axios.isAxiosError(err)) return fallback;
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message?: string }).message || fallback);
  }
  return fallback;
}

export default function DelhiverySettingsPage() {
  const { tenantId = "" } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingWarehouse, setSavingWarehouse] = useState(false);
  const [settings, setSettings] = useState<DelhiverySettings | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [apiToken, setApiToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [testResult, setTestResult] = useState("");

  const [whName, setWhName] = useState("");
  const [whEmail, setWhEmail] = useState("");
  const [whPhone, setWhPhone] = useState("");
  const [whAddress, setWhAddress] = useState("");
  const [whCity, setWhCity] = useState("");
  const [whState, setWhState] = useState("");
  const [whPin, setWhPin] = useState("");

  const load = async () => {
    const data = await getDelhiverySettings(tenantId);
    setSettings(data);
    setEnabled(Boolean(data.enabled));
    const pickup = data.pickupLocation;
    if (pickup) {
      setWhName(pickup.name || data.pickupLocationName || "");
      setWhEmail(pickup.email || "");
      setWhPhone(pickup.phone || "");
      setWhAddress(pickup.address || "");
      setWhCity(pickup.city || "");
      setWhState(pickup.state || "");
      setWhPin(pickup.pincode || "");
    } else if (data.pickupLocationName) {
      setWhName(data.pickupLocationName);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError("");
        await load();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Failed to load Delhivery settings."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await saveDelhiverySettings(tenantId, {
        enabled,
        apiToken: apiToken.trim() || undefined,
        pickupLocationName: whName.trim() || undefined,
      });
      setSettings(result.data);
      setApiToken("");
      setSuccess(result.message || "Saved.");
    } catch (err) {
      setError(errorMessage(err, "Failed to save settings."));
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setError("");
    setTestResult("");
    try {
      const result = await testDelhiveryConnection(tenantId, whPin || "110001");
      const d = result.data;
      setTestResult(
        result.message
          ? `${result.message} Pincode ${d.pincode}: ${d.serviceable ? "serviceable" : "not serviceable"} (COD ${d.cod ? "yes" : "no"}).`
          : "Connection OK.",
      );
    } catch (err) {
      setError(errorMessage(err, "Connection test failed."));
    } finally {
      setTesting(false);
    }
  };

  const onWarehouse = async (event: FormEvent) => {
    event.preventDefault();
    setSavingWarehouse(true);
    setError("");
    setSuccess("");
    try {
      const result = await createDelhiveryWarehouse(tenantId, {
        name: whName.trim(),
        email: whEmail.trim(),
        phone: whPhone.trim(),
        address: whAddress.trim(),
        city: whCity.trim(),
        country: "India",
        pin: whPin.trim(),
        return_address: whAddress.trim(),
        return_pin: whPin.trim(),
        return_city: whCity.trim(),
        return_state: whState.trim(),
        return_country: "India",
      });
      setSuccess(result.message || "Pickup location registered.");
      await load();
    } catch (err) {
      setError(errorMessage(err, "Failed to register pickup location."));
    } finally {
      setSavingWarehouse(false);
    }
  };

  if (loading) {
    return <PageLoader message="Loading Delhivery settings..." />;
  }

  return (
    <div className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(`/admin/tenants/${tenantId}`)}
      >
        ← Back to store
      </button>

      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>SHIPPING</span>
          <h1>Delhivery</h1>
          <p>
            Connect this store&apos;s Delhivery One account. Token is encrypted on the
            server and never shown in full after save.
          </p>
        </div>
        <span
          className={
            settings?.connected ? styles.statusConnected : styles.statusDisconnected
          }
        >
          {settings?.connected ? "Connected" : "Not connected"}
        </span>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}
      {testResult ? <div className={styles.success}>{testResult}</div> : null}

      <form className={styles.card} onSubmit={onSave}>
        <h2>API connection</h2>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable Delhivery for this store
        </label>

        <label className={styles.field}>
          API token
          <input
            type="password"
            autoComplete="off"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={
              settings?.apiTokenMasked
                ? `Saved: ${settings.apiTokenMasked}`
                : "Paste Delhivery API token"
            }
          />
        </label>
        {settings?.apiTokenMasked ? (
          <p className={styles.hint}>Stored token: {settings.apiTokenMasked}</p>
        ) : null}

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={testing || !settings?.hasApiToken}
            onClick={onTest}
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
        </div>
      </form>

      <form className={styles.card} onSubmit={onWarehouse}>
        <h2>Pickup location</h2>
        <p className={styles.hint}>
          Registers the warehouse with Delhivery and saves it for this tenant only.
        </p>
        <div className={styles.grid}>
          <label className={styles.field}>
            Name
            <input required value={whName} onChange={(e) => setWhName(e.target.value)} />
          </label>
          <label className={styles.field}>
            Phone
            <input required value={whPhone} onChange={(e) => setWhPhone(e.target.value)} />
          </label>
          <label className={styles.field}>
            Email
            <input
              required
              type="email"
              value={whEmail}
              onChange={(e) => setWhEmail(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            PIN
            <input
              required
              pattern="\d{6}"
              value={whPin}
              onChange={(e) => setWhPin(e.target.value)}
            />
          </label>
          <label className={`${styles.field} ${styles.full}`}>
            Address
            <textarea
              required
              rows={2}
              value={whAddress}
              onChange={(e) => setWhAddress(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            City
            <input required value={whCity} onChange={(e) => setWhCity(e.target.value)} />
          </label>
          <label className={styles.field}>
            State
            <input required value={whState} onChange={(e) => setWhState(e.target.value)} />
          </label>
        </div>
        <button
          type="submit"
          className={styles.primaryButton}
          disabled={savingWarehouse || !settings?.hasApiToken}
        >
          {savingWarehouse ? "Registering..." : "Register pickup location"}
        </button>
      </form>
    </div>
  );
}
