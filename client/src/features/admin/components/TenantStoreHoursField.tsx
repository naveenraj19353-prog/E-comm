import { useRef, useState } from "react";
import { uploadImageToS3 } from "../api/upload.api";
import {
    emptyStoreHours,
    fromDatetimeLocalValue,
    resolveStoreHours,
    toDatetimeLocalValue,
    type StoreHours,
    type StoreHoursKind,
} from "../../tenant/storeHours";
import styles from "../styles/EditTenant.module.css";

type Props = {
    tenantId: string;
    value: StoreHours;
    onChange: (next: StoreHours) => void;
    disabled?: boolean;
};

export default function TenantStoreHoursField({
    tenantId,
    value,
    onChange,
    disabled,
}: Props) {
    const hours = {
        ...emptyStoreHours(),
        ...value,
        images: value.images || [],
        windows: value.windows || [],
    };
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");

    const update = (patch: Partial<StoreHours>) => {
        onChange({ ...hours, ...patch });
    };

    const addWindow = (kind: StoreHoursKind) => {
        const start = new Date();
        const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
        update({
            windows: [
                ...(hours.windows || []),
                {
                    kind,
                    startAt: start.toISOString(),
                    endAt: end.toISOString(),
                },
            ],
        });
    };

    const updateWindow = (index: number, patch: Partial<(typeof hours.windows)[number]>) => {
        update({
            windows: (hours.windows || []).map((window, current) =>
                current === index ? { ...window, ...patch } : window,
            ),
        });
    };

    const handleUpload = async (file?: File) => {
        setError("");
        if (!file || !tenantId) {
            return;
        }
        if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
            setError("Use a JPEG, PNG, WEBP, or GIF under 10 MB.");
            return;
        }
        setUploading(true);
        try {
            const uploaded = await uploadImageToS3(file, tenantId, "branding");
            const next = uploaded.url || uploaded.key;
            update({ images: [...(hours.images || []), next].slice(0, 5) });
        } catch {
            setError("Unable to upload image.");
        } finally {
            setUploading(false);
            if (inputRef.current) {
                inputRef.current.value = "";
            }
        }
    };

    const resolved = resolveStoreHours(hours);

    return (
        <div className={styles.scheduleBlock}>
            <div className={styles.statusSection}>
                <div>
                    <h3>Store on / off schedule</h3>
                    <p>
                        Plan future closed or open times. Shoppers see a popup with your
                        message, images, and a countdown while the store is off.
                    </p>
                    {hours.enabled ? (
                        <small>
                            {resolved.isOpen
                                ? "Store is open for customers right now."
                                : "Store is closed for customers right now. The popup will show on the storefront."}
                            {resolved.nextChangeAt
                                ? ` Next change: ${new Date(resolved.nextChangeAt).toLocaleString()}.`
                                : ""}
                        </small>
                    ) : null}
                </div>
                <button
                    type="button"
                    className={`${styles.toggle} ${hours.enabled ? styles.toggleActive : ""}`}
                    onClick={() => update({ enabled: !hours.enabled })}
                    disabled={disabled}
                    aria-label={hours.enabled ? "Disable schedule" : "Enable schedule"}
                >
                    <span />
                </button>
            </div>
            {hours.enabled ? (
                <>
                    <div className={styles.field}>
                        <label htmlFor="store-hours-default">When no time is scheduled</label>
                        <select
                            id="store-hours-default"
                            value={hours.defaultOpen ? "open" : "closed"}
                            onChange={(event) =>
                                update({ defaultOpen: event.target.value === "open" })
                            }
                            disabled={disabled}
                        >
                            <option value="open">Stay open</option>
                            <option value="closed">Stay closed</option>
                        </select>
                        <small>
                            The popup shows only while an Off time is active, or if default is Stay closed.
                            Add off time starts now so you can check it immediately. Save, then open the storefront.
                        </small>
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="store-closed-message">Closed popup message</label>
                        <textarea
                            id="store-closed-message"
                            rows={3}
                            value={hours.message || ""}
                            onChange={(event) => update({ message: event.target.value })}
                            placeholder="We are closed right now. Come back when the timer ends."
                            disabled={disabled}
                        />
                    </div>
                    <div className={styles.field}>
                        <label htmlFor="store-closed-images">Popup images</label>
                        <input
                            ref={inputRef}
                            id="store-closed-images"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            disabled={disabled || uploading || (hours.images || []).length >= 5}
                            onChange={(event) => void handleUpload(event.target.files?.[0])}
                        />
                        <small>Up to 5 images. They rotate in the closed popup.</small>
                        {uploading ? <small>Uploading...</small> : null}
                        {error ? <small className={styles.logoError}>{error}</small> : null}
                        {(hours.images || []).length ? (
                            <div className={styles.scheduleImages}>
                                {hours.images.map((src, index) => (
                                    <div key={`${src}-${index}`} className={styles.scheduleImage}>
                                        <img src={src} alt="" />
                                        <button
                                            type="button"
                                            onClick={() =>
                                                update({
                                                    images: hours.images.filter((_, current) => current !== index),
                                                })
                                            }
                                        >
                                            Remove
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : null}
                    </div>
                    <div className={styles.permissionActions}>
                        <button type="button" className={styles.backButton} onClick={() => addWindow("off")}>
                            Add off time
                        </button>
                        <button type="button" className={styles.backButton} onClick={() => addWindow("on")}>
                            Add on time
                        </button>
                    </div>
                    {(hours.windows || []).length === 0 ? (
                        <small>No future windows yet. Off times close the store until the end time.</small>
                    ) : (
                        hours.windows.map((window, index) => (
                            <div key={`${window.kind}-${index}`} className={styles.scheduleWindow}>
                                <select
                                    value={window.kind}
                                    onChange={(event) =>
                                        updateWindow(index, {
                                            kind: event.target.value as StoreHoursKind,
                                        })
                                    }
                                >
                                    <option value="off">Off</option>
                                    <option value="on">On</option>
                                </select>
                                <input
                                    type="datetime-local"
                                    value={toDatetimeLocalValue(window.startAt)}
                                    onChange={(event) =>
                                        updateWindow(index, {
                                            startAt: fromDatetimeLocalValue(event.target.value),
                                        })
                                    }
                                />
                                <input
                                    type="datetime-local"
                                    value={toDatetimeLocalValue(window.endAt)}
                                    onChange={(event) =>
                                        updateWindow(index, {
                                            endAt: fromDatetimeLocalValue(event.target.value),
                                        })
                                    }
                                />
                                <button
                                    type="button"
                                    className={styles.backButton}
                                    onClick={() =>
                                        update({
                                            windows: hours.windows.filter((_, current) => current !== index),
                                        })
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        ))
                    )}
                </>
            ) : null}
        </div>
    );
}
