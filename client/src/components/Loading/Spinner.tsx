import { Loader2 } from "lucide-react";
import styles from "./Spinner.module.css";

export type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

export interface SpinnerProps {
    size?: SpinnerSize;
    /**
     * Accessible label. When set, the spinner becomes a live region so assistive
     * tech announces the wait instead of relying on the button text alone.
     */
    label?: string;
    /** Centre the spinner inside its container. */
    block?: boolean;
    className?: string;
}

/**
 * Inline loading indicator. Inherits `currentColor`, so it drops into any
 * button or panel and picks up the theme automatically.
 */
const Spinner = ({ size = "md", label, block = false, className }: SpinnerProps) => (
    <span
        className={[styles.wrapper, block ? styles.block : "", className]
            .filter(Boolean)
            .join(" ")}
        role={label ? "status" : undefined}
        aria-live={label ? "polite" : undefined}
    >
        <Loader2
            className={`${styles.spinner} ${styles[size]}`}
            aria-hidden="true"
        />
        {label ? <span className={styles.label}>{label}</span> : null}
    </span>
);

export default Spinner;
