import { CheckCircle2, CircleX, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import Modal from "./Modal";
import styles from "./Modal.module.css";
import type { AlertDialogRequest, AlertTone } from "./alertService";

const MESSAGE_ID = "alert-dialog-message";

const TONE_META: Record<AlertTone, { title: string; icon: ReactNode }> = {
    info: { title: "Heads up", icon: <Info size={22} strokeWidth={2.1} /> },
    success: { title: "All done", icon: <CheckCircle2 size={22} strokeWidth={2.1} /> },
    warning: { title: "Please check", icon: <TriangleAlert size={22} strokeWidth={2.1} /> },
    danger: { title: "Something went wrong", icon: <CircleX size={22} strokeWidth={2.1} /> },
};

interface AlertDialogProps {
    request: AlertDialogRequest;
    /** `true` when the user answered the primary button, `false` otherwise. */
    onResolve: (confirmed: boolean) => void;
}

/** Themed replacement for `window.alert` / `window.confirm`. */
const AlertDialog = ({ request, onResolve }: AlertDialogProps) => {
    const isConfirm = request.kind === "confirm";
    const tone = request.tone ?? (isConfirm ? "warning" : "info");
    const meta = TONE_META[tone];
    const dismissible = request.dismissible !== false;
    const confirmLabel = request.confirmLabel ?? (isConfirm ? "Confirm" : "OK");
    const cancelLabel = request.cancelLabel ?? "Cancel";

    const confirmButton = (
        <button
            type="button"
            autoFocus
            className={
                tone === "danger"
                    ? `${styles.primaryButton} ${styles.dangerButton}`
                    : styles.primaryButton
            }
            onClick={() => onResolve(true)}
        >
            {confirmLabel}
        </button>
    );

    return (
        <Modal
            open
            title={request.title ?? meta.title}
            icon={meta.icon}
            tone={tone}
            size="sm"
            describedBy={MESSAGE_ID}
            hideCloseButton={!dismissible}
            closeOnOverlayClick={dismissible}
            closeOnEscape={dismissible}
            onClose={() => onResolve(false)}
            footer={
                isConfirm ? (
                    <>
                        <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => onResolve(false)}
                        >
                            {cancelLabel}
                        </button>
                        {confirmButton}
                    </>
                ) : (
                    confirmButton
                )
            }
        >
            <p id={MESSAGE_ID} className={styles.message}>
                {request.message}
            </p>
        </Modal>
    );
};

export default AlertDialog;
