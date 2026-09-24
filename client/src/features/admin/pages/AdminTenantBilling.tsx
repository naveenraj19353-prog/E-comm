import { useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { useTenantByTenantId } from "../hooks/useTenants";
import { useBillingStatus, useSetBillingExempt, useSubscribe } from "../hooks/useBilling";
import {
    BILLING_STATUS_LABELS,
    formatBillingPrice,
    formatTrialDaysLeft,
    type BillingStatus,
} from "../api/billing.api";
import { formatOrderDate } from "../../orders/api/order.api";
import { getApiErrorMessage } from "../utils/tenantForm.utils";
import styles from "../styles/AdminTenantPayments.module.css";
import billingStyles from "../styles/AdminTenantBilling.module.css";

type CardTone = "default" | "warning" | "danger";

interface StatusCardContent {
    tone: CardTone;
    headline: string;
    detail?: string;
    /** Label for the subscribe button; omitted when there is nothing to pay. */
    actionLabel?: string;
    /** Shown instead of a button when auto-pay is already in place. */
    doneLabel?: string;
}

function statusCardContent(billing: BillingStatus, subject: string): StatusCardContent {
    const price = formatBillingPrice(billing.priceInr);
    switch (billing.status) {
        case "exempt":
            return {
                tone: "default",
                headline: `${subject} is on a free plan. No billing.`,
            };
        case "trialing": {
            const trialEnds = formatOrderDate(billing.trialEndsAt || undefined);
            return {
                tone: "default",
                headline: `Free trial — ${formatTrialDaysLeft(billing.trialDaysLeft)} (ends ${trialEnds})`,
                detail: billing.autopaySetUp
                    ? `All set — ${subject.toLowerCase()} keeps running without interruption when the trial ends.`
                    : "Set up auto-pay now and keep every free day — your first charge is scheduled for the day your trial ends. Pay by UPI Autopay or card.",
                actionLabel: billing.autopaySetUp ? undefined : `Set up auto-pay — ${price} from ${trialEnds}`,
                doneLabel: billing.autopaySetUp ? `Auto-pay is set up ✓ — first charge on ${trialEnds}` : undefined,
            };
        }
        case "active":
            if (billing.cancelledAt) {
                return {
                    tone: "default",
                    headline: `Cancelled — active until ${formatOrderDate(billing.currentPeriodEnd || undefined)}`,
                    detail: `Resubscribe to keep ${subject.toLowerCase()} online after this date.`,
                    actionLabel: "Resubscribe",
                };
            }
            return {
                tone: "default",
                headline: `Subscribed — ${price}. Next charge ${formatOrderDate(billing.currentPeriodEnd || undefined)}`,
            };
        case "past_due":
            return {
                tone: "warning",
                headline: `Payment due — ${subject.toLowerCase()} goes offline on ${formatOrderDate(billing.graceEndsAt || undefined)} unless payment is set up.`,
                detail: "The storefront keeps working until then.",
                actionLabel: `Pay ${price} now`,
            };
        case "suspended":
            return {
                tone: "danger",
                headline: `${subject} is offline. Customers can't see it or place orders.`,
                detail: "Subscribe to bring it back online immediately.",
                actionLabel: `Reactivate — ${price}`,
            };
        default:
            return { tone: "default", headline: "Billing status unavailable." };
    }
}

export default function AdminTenantBilling() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isSuperAdmin = user?.role === "super_admin";
    const isStoreOwner = user?.role === "admin";
    const canViewBilling = isSuperAdmin || isStoreOwner;

    const { data: tenant } = useTenantByTenantId(tenantId);
    const {
        data: billing,
        isLoading,
        isError,
    } = useBillingStatus(tenantId, canViewBilling && Boolean(tenantId));

    const subscribeMutation = useSubscribe();
    const setExemptMutation = useSetBillingExempt();

    const [isRedirecting, setIsRedirecting] = useState(false);
    const [subscribeError, setSubscribeError] = useState("");
    const [exemptError, setExemptError] = useState("");
    const [exemptSuccess, setExemptSuccess] = useState("");

    if (!canViewBilling) {
        return <Navigate to={`/admin/tenants/${tenantId}`} replace />;
    }

    const handleSubscribe = () => {
        setSubscribeError("");
        subscribeMutation.mutate(tenantId, {
            onSuccess: (result) => {
                if (!result.shortUrl) {
                    setSubscribeError("Unable to open the payment page. Please try again.");
                    return;
                }
                setIsRedirecting(true);
                window.location.assign(result.shortUrl);
            },
            onError: (err) => {
                setSubscribeError(getApiErrorMessage(err, "Unable to start the subscription."));
            },
        });
    };

    const handleToggleExempt = () => {
        if (!billing) {
            return;
        }
        const exempt = billing.status !== "exempt";
        if (
            !exempt &&
            !window.confirm(
                `Remove the billing exemption for ${tenant?.name || "this store"}? ` +
                    "It will NOT get a new free trial — it moves straight to Payment due with a 7-day grace period, " +
                    "and the storefront goes offline after that unless the owner sets up payment.",
            )
        ) {
            return;
        }
        setExemptError("");
        setExemptSuccess("");
        setExemptMutation.mutate(
            { tenantId, exempt },
            {
                onSuccess: () => {
                    setExemptSuccess(
                        exempt
                            ? "Store marked as exempt from billing."
                            : "Exemption removed. The store now has a 7-day grace period to set up payment.",
                    );
                },
                onError: (err) => {
                    setExemptError(getApiErrorMessage(err, "Unable to update billing exemption."));
                },
            },
        );
    };

    if (isLoading) {
        return <div className={styles.state}>Loading billing...</div>;
    }

    if (isError || !billing) {
        return <div className={styles.state}>Failed to load billing status.</div>;
    }

    const content = statusCardContent(billing, isSuperAdmin ? "This store" : "Your store");
    const showSubscribe = !isSuperAdmin && Boolean(content.actionLabel);
    const isSubscribing = subscribeMutation.isPending || isRedirecting;

    let action: ReactNode = null;
    if (showSubscribe) {
        action = (
            <button
                type="button"
                className={styles.saveButton}
                disabled={isSubscribing || !billing.billingConfigured}
                onClick={handleSubscribe}
            >
                {isSubscribing ? "Opening payment page..." : content.actionLabel}
            </button>
        );
    } else if (content.doneLabel) {
        action = <span className={billingStyles.autopayDone}>{content.doneLabel}</span>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <button
                    type="button"
                    className={styles.backButton}
                    onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                >
                    ← Back to store
                </button>
                <span className={styles.eyebrow}>BILLING</span>
                <h1>{tenant?.name || "Store"} billing</h1>
                <p>Your Retail Cosmos plan, free trial and auto-pay.</p>
            </div>

            <div className={styles.section}>
                <div className={styles.sectionHeader}>
                    <h2>Plan Status</h2>
                </div>
                <div
                    className={`${billingStyles.statusCard} ${
                        content.tone === "default" ? "" : billingStyles[`card_${content.tone}`]
                    }`}
                >
                    <span className={`${billingStyles.status} ${billingStyles[`status_${billing.status}`]}`}>
                        {BILLING_STATUS_LABELS[billing.status] || billing.status}
                    </span>
                    <h2>{content.headline}</h2>
                    {content.detail ? <p className={billingStyles.detail}>{content.detail}</p> : null}
                    {isSuperAdmin && billing.status !== "exempt" ? (
                        <p className={billingStyles.detail}>
                            Auto-pay: {billing.autopaySetUp ? "set up" : "not set up"}
                        </p>
                    ) : null}
                    {action ? <div className={billingStyles.actions}>{action}</div> : null}
                    {showSubscribe && !billing.billingConfigured ? (
                        <p className={billingStyles.note}>
                            Online payment isn't available yet — contact support.
                        </p>
                    ) : null}
                    {showSubscribe && billing.billingConfigured ? (
                        <p className={billingStyles.note}>
                            Just set up auto-pay? It can take a minute to show up here.
                        </p>
                    ) : null}
                    {subscribeError ? <p className={styles.error}>{subscribeError}</p> : null}
                </div>
            </div>

            {isSuperAdmin && (
                <div className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2>Billing Exemption</h2>
                    </div>
                    <div className={billingStyles.exemptCard}>
                        <p>
                            {billing.status === "exempt" ? (
                                <>
                                    <strong>Billing exempt.</strong> This store is free forever and is never billed.
                                </>
                            ) : (
                                <>
                                    <strong>Not exempt.</strong> Mark this store exempt to waive billing permanently.
                                </>
                            )}
                        </p>
                        <button
                            type="button"
                            className={
                                billing.status === "exempt" ? billingStyles.secondaryButton : styles.saveButton
                            }
                            disabled={setExemptMutation.isPending}
                            onClick={handleToggleExempt}
                        >
                            {setExemptMutation.isPending
                                ? "Saving..."
                                : billing.status === "exempt"
                                    ? "Remove exemption"
                                    : "Mark as exempt"}
                        </button>
                    </div>
                    {exemptError ? <p className={styles.error}>{exemptError}</p> : null}
                    {exemptSuccess ? <p className={styles.success}>{exemptSuccess}</p> : null}
                </div>
            )}
        </div>
    );
}
