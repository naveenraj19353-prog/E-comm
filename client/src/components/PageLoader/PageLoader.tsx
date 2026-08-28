import { Loader2 } from "lucide-react";
import styles from "./PageLoader.module.css";

interface PageLoaderProps {
    message?: string;
    fullViewport?: boolean;
}

const PageLoader = ({ message = "Loading...", fullViewport = false }: PageLoaderProps) => {
    return (
        <div
            className={`${styles.loader} ${fullViewport ? styles.fullViewport : ""}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <div className={styles.content}>
                <Loader2 className={styles.spinner} size={32} aria-hidden="true" />
                <p>{message}</p>
            </div>
        </div>
    );
};

export default PageLoader;
