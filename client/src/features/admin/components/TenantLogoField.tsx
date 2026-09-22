import { useRef, useState } from "react";
import { uploadImageToS3 } from "../api/upload.api";
import styles from "../styles/EditTenant.module.css";

const LOGO_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

type TenantLogoFieldProps = {
    tenantId: string;
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
};

export default function TenantLogoField({
    tenantId,
    value,
    onChange,
    disabled,
}: TenantLogoFieldProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState("");
    const canUpload = Boolean(tenantId.trim()) && !disabled && !uploading;

    const handleFile = async (file: File | undefined) => {
        setError("");
        if (!file || !tenantId.trim()) {
            return;
        }
        const type = String(file.type || "").toLowerCase();
        if (!type.startsWith("image/") || file.size > 10 * 1024 * 1024) {
            setError("Use a JPEG, PNG, WEBP, or GIF under 10 MB.");
            return;
        }
        setUploading(true);
        try {
            const uploaded = await uploadImageToS3(file, tenantId.trim(), "branding");
            onChange(uploaded.url || uploaded.key);
        } catch {
            setError("Unable to upload logo. Try again.");
        } finally {
            setUploading(false);
            if (inputRef.current) {
                inputRef.current.value = "";
            }
        }
    };

    return (
        <div className={styles.field}>
            <label htmlFor="tenant-logo-file">Store logo</label>
            <input
                ref={inputRef}
                id="tenant-logo-file"
                type="file"
                accept={LOGO_ACCEPT}
                disabled={!canUpload}
                onChange={(event) => void handleFile(event.target.files?.[0])}
            />
            <small>
                Optional. If you skip this, the store keeps the current name and
                initials in the header.
            </small>
            {uploading ? <small>Uploading logo...</small> : null}
            {error ? <small className={styles.logoError}>{error}</small> : null}
            {value ? (
                <div className={styles.logoPreviewRow}>
                    <div className={styles.logoPreview}>
                        <img
                            src={value}
                            alt="Store logo preview"
                            onError={(event) => {
                                event.currentTarget.style.display = "none";
                            }}
                        />
                    </div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => onChange("")}
                        disabled={disabled || uploading}
                    >
                        Remove logo
                    </button>
                </div>
            ) : null}
        </div>
    );
}
