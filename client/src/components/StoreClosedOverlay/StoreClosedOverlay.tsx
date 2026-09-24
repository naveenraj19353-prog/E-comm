import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { resolveStoreHours } from "../../features/tenant/storeHours";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { isStoreStaff } from "../../features/auth/roles";
import styles from "./StoreClosedOverlay.module.css";

function pad(value: number) {
    return String(value).padStart(2, "0");
}

function staffContinueKey(tenantId?: string) {
    return `store-hours-staff-continue:${tenantId || "store"}`;
}

export default function StoreClosedOverlay() {
    const queryClient = useQueryClient();
    const { tenant, tenantSlug } = useStorefrontTenant();
    const { user: sessionUser, staffUser } = useAuth();
    const user = staffUser ?? sessionUser;
    const [now, setNow] = useState(() => Date.now());
    const [imageIndex, setImageIndex] = useState(0);
    const [staffContinue, setStaffContinue] = useState(false);

    const hours = useMemo(
        () => resolveStoreHours(tenant?.storeHours, now),
        [tenant?.storeHours, now],
    );
    const isOperator =
        user?.role === "super_admin" ||
        (isStoreStaff(user?.role) && user?.tenantId === tenant?.tenantId);
    const remaining = hours.nextChangeAt
        ? Math.max(Date.parse(hours.nextChangeAt) - now, 0)
        : 0;
    const totalSeconds = Math.floor(remaining / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hoursLeft = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    useEffect(() => {
        setStaffContinue(
            window.sessionStorage.getItem(staffContinueKey(tenant?.tenantId)) === "1",
        );
    }, [tenant?.tenantId]);

    useEffect(() => {
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!hours.images?.length) {
            return;
        }
        const id = window.setInterval(() => {
            setImageIndex((current) => (current + 1) % hours.images!.length);
        }, 4000);
        return () => window.clearInterval(id);
    }, [hours.images]);

    useEffect(() => {
        if (!hours.enabled || !hours.nextChangeAt || remaining > 0) {
            return;
        }
        void queryClient.invalidateQueries({ queryKey: ["tenant", "slug", tenantSlug] });
    }, [hours.enabled, hours.nextChangeAt, remaining, queryClient, tenantSlug]);

    if (!hours.enabled || hours.isOpen || (isOperator && staffContinue)) {
        return null;
    }

    const image = hours.images?.[imageIndex] || hours.images?.[0] || "";
    const message =
        hours.message ||
        "This store is currently closed. Please check back when we open again.";

    const continueAsStaff = () => {
        window.sessionStorage.setItem(staffContinueKey(tenant?.tenantId), "1");
        setStaffContinue(true);
    };

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Store closed">
            <div className={styles.card}>
                {image ? (
                    <img className={styles.image} src={image} alt="" />
                ) : null}
                <p className={styles.eyebrow}>Store closed</p>
                <h2>{tenant?.name || "Store"}</h2>
                <p className={styles.message}>{message}</p>
                {hours.nextChangeAt ? (
                    <div className={styles.timer} aria-label="Opens in">
                        {days > 0 ? (
                            <div>
                                <span>{pad(days)}</span>
                                <small>Days</small>
                            </div>
                        ) : null}
                        <div>
                            <span>{pad(hoursLeft)}</span>
                            <small>Hours</small>
                        </div>
                        <div>
                            <span>{pad(minutes)}</span>
                            <small>Min</small>
                        </div>
                        <div>
                            <span>{pad(seconds)}</span>
                            <small>Sec</small>
                        </div>
                    </div>
                ) : (
                    <p className={styles.hint}>We’ll be back soon.</p>
                )}
                {isOperator ? (
                    <button type="button" className={styles.staffButton} onClick={continueAsStaff}>
                        Continue as store staff
                    </button>
                ) : null}
            </div>
        </div>
    );
}
