import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import PageLoader from "../../../components/PageLoader";
import {
  getPeriskopeNotifications,
  getPeriskopeSettings,
  retryPeriskopeNotification,
  savePeriskopeSettings,
  testPeriskopeConnection,
  type PeriskopeNotificationLog,
  type PeriskopeNotificationPreferences,
  type PeriskopeSettings,
} from "../api/periskope.api";
import styles from "../styles/PeriskopeSettings.module.css";

const notificationOptions: Array<{
  key: keyof PeriskopeNotificationPreferences;
  label: string;
  description: string;
}> = [
  {
    key: "orderConfirmation",
    label: "Order confirmation",
    description: "Sent after a retail order is successfully created.",
  },
  {
    key: "paymentSuccess",
    label: "Payment success",
    description: "Sent after Razorpay payment fulfillment succeeds.",
  },
  {
    key: "shipmentUpdates",
    label: "Shipment updates",
    description: "Processing, shipped, and Delhivery shipment-created messages.",
  },
  {
    key: "deliveryUpdates",
    label: "Delivery updates",
    description: "Sent when an order is marked delivered.",
  },
  {
    key: "cancellation",
    label: "Cancellation",
    description: "Sent when an order is cancelled.",
  },
];

function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const detail = error.response?.data?.detail;
  if (typeof detail === "string") return detail;
  return fallback;
}

export default function PeriskopeSettingsPage() {
  const { tenantId = "" } = useParams();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<PeriskopeSettings | null>(null);
  const [notifications, setNotifications] = useState<PeriskopeNotificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [retryingId, setRetryingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = async () => {
    const [settingsData, logData] = await Promise.all([
      getPeriskopeSettings(tenantId),
      getPeriskopeNotifications(tenantId),
    ]);
    setSettings(settingsData);
    setNotifications(logData);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (loadError) {
        if (!cancelled) {
          setError(errorMessage(loadError, "Failed to load WhatsApp settings."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const updateNotification = (
    key: keyof PeriskopeNotificationPreferences,
    checked: boolean,
  ) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            notifications: { ...current.notifications, [key]: checked },
          }
        : current,
    );
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await savePeriskopeSettings(tenantId, {
        enabled: settings.enabled,
        webhookEnabled: settings.webhookEnabled,
        notifications: settings.notifications,
      });
      setSettings(result.data);
      setSuccess(result.message || "WhatsApp settings saved.");
    } catch (saveError) {
      setError(errorMessage(saveError, "Failed to save WhatsApp settings."));
    } finally {
      setSaving(false);
    }
  };

  const onTest = async () => {
    setTesting(true);
    setError("");
    setSuccess("");
    try {
      const result = await testPeriskopeConnection(tenantId);
      setSuccess(result.message);
    } catch (testError) {
      setError(errorMessage(testError, "Unable to connect to Periskope."));
    } finally {
      setTesting(false);
    }
  };

  const onRetry = async (notificationId: string) => {
    setRetryingId(notificationId);
    setError("");
    try {
      const result = await retryPeriskopeNotification(tenantId, notificationId);
      setSuccess(result.message);
      await load();
    } catch (retryError) {
      setError(errorMessage(retryError, "Unable to retry notification."));
    } finally {
      setRetryingId("");
    }
  };

  if (loading || !settings) {
    return <PageLoader message="Loading WhatsApp settings..." />;
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
          <span className={styles.eyebrow}>MESSAGING</span>
          <h1>WhatsApp</h1>
          <p>
            Manage Periskope notifications for this store. Credentials stay on
            the Retail Cosmos backend and are never sent to this browser.
          </p>
        </div>
        <span
          className={
            settings.connected ? styles.statusConnected : styles.statusDisconnected
          }
        >
          {settings.connected ? "Connected" : "Not configured"}
        </span>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}
      {success ? <div className={styles.success}>{success}</div> : null}

      <form className={styles.card} onSubmit={onSave}>
        <h2>Periskope connection</h2>
        <div className={styles.connectionGrid}>
          <div>
            <span>Provider</span>
            <strong>Periskope</strong>
          </div>
          <div>
            <span>Sender phone</span>
            <strong>{settings.senderPhone || "Not configured"}</strong>
          </div>
          <div>
            <span>Webhook signature</span>
            <strong>{settings.webhookConfigured ? "Configured" : "Missing"}</strong>
          </div>
        </div>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.enabled}
            disabled={!settings.connected}
            onChange={(event) =>
              setSettings({ ...settings, enabled: event.target.checked })
            }
          />
          Enable WhatsApp notifications for this store
        </label>

        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={settings.webhookEnabled}
            onChange={(event) =>
              setSettings({ ...settings, webhookEnabled: event.target.checked })
            }
          />
          Mark the Periskope webhook enabled for this store
        </label>

        <h2>Notifications</h2>
        <div className={styles.options}>
          {notificationOptions.map((option) => (
            <label className={styles.option} key={option.key}>
              <input
                type="checkbox"
                checked={settings.notifications[option.key]}
                onChange={(event) =>
                  updateNotification(option.key, event.target.checked)
                }
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="submit" className={styles.primaryButton} disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={testing || !settings.connected}
            onClick={onTest}
          >
            {testing ? "Testing..." : "Test connection"}
          </button>
        </div>
      </form>

      <section className={styles.card}>
        <div className={styles.logHeader}>
          <div>
            <h2>Recent notifications</h2>
            <p>Only safe metadata is retained; message content is not stored.</p>
          </div>
          <button type="button" className={styles.refreshButton} onClick={load}>
            Refresh
          </button>
        </div>
        {notifications.length ? (
          <div className={styles.logs}>
            {notifications.map((notification) => (
              <div className={styles.log} key={notification.id}>
                <div>
                  <strong>{notification.eventType}</strong>
                  <span>
                    {notification.orderId
                      ? `Order ${notification.orderId.slice(-8).toUpperCase()}`
                      : notification.productId
                        ? `Product ${notification.productId.slice(-8).toUpperCase()}`
                        : "Notification"}{" "}
                    ·{" "}
                    {notification.phone || "No phone"}
                  </span>
                  {notification.error ? <small>{notification.error}</small> : null}
                </div>
                <div className={styles.logAction}>
                  <span className={styles[notification.status]}>
                    {notification.status}
                  </span>
                  {notification.status === "failed" ||
                  notification.status === "skipped" ? (
                    <button
                      type="button"
                      onClick={() => onRetry(notification.id)}
                      disabled={retryingId === notification.id}
                    >
                      {retryingId === notification.id ? "Retrying..." : "Retry"}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>No notification attempts yet.</p>
        )}
      </section>
    </div>
  );
}
