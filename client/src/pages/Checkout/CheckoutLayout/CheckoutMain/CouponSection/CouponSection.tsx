import { Tag, X } from "lucide-react";
import styles from "./CouponSection.module.css";

interface CouponSectionProps {
    value: string;
    appliedCode: string | null;
    error?: string | null;
    isApplying?: boolean;
    onChange: (value: string) => void;
    onApply: () => void;
    onRemove: () => void;
}

const CouponSection = ({
    value,
    appliedCode,
    error,
    isApplying = false,
    onChange,
    onApply,
    onRemove,
}: CouponSectionProps) => {
    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        onApply();
    };

    return (
        <section className={styles.section}>
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>COUPON</span>
                    <h2>Have a coupon?</h2>
                    <p>Apply a discount code before you place your order.</p>
                </div>
            </div>

            {appliedCode ? (
                <div className={styles.applied}>
                    <div className={styles.appliedInfo}>
                        <Tag size={16} />
                        <div>
                            <strong>{appliedCode}</strong>
                            <span>Coupon applied</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className={styles.removeButton}
                        onClick={onRemove}
                    >
                        <X size={14} />
                        Remove
                    </button>
                </div>
            ) : (
                <form className={styles.form} onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={value}
                        onChange={(event) =>
                            onChange(event.target.value.toUpperCase())
                        }
                        placeholder="Enter coupon code"
                        className={styles.input}
                        aria-label="Coupon code"
                    />
                    <button
                        type="submit"
                        className={styles.applyButton}
                        disabled={!value.trim() || isApplying}
                    >
                        {isApplying ? "Applying..." : "Apply"}
                    </button>
                </form>
            )}

            {error && <p className={styles.error}>{error}</p>}
        </section>
    );
};

export default CouponSection;
