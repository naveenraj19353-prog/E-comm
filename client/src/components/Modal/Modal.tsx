import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./Modal.module.css";

export type ModalSize = "sm" | "md" | "lg";

/** Drives the accent colour of a popup; mapped to the store theme variables. */
export type ModalTone = "info" | "success" | "warning" | "danger";

export interface ModalProps {
    /** Defaults to true; pass false to keep the modal mounted but hidden. */
    open?: boolean;
    onClose?: () => void;
    title?: ReactNode;
    /** Small uppercase label above the title. */
    eyebrow?: ReactNode;
    icon?: ReactNode;
    tone?: ModalTone;
    size?: ModalSize;
    children?: ReactNode;
    /** Buttons rendered in the bottom action row. */
    footer?: ReactNode;
    hideCloseButton?: boolean;
    closeOnOverlayClick?: boolean;
    closeOnEscape?: boolean;
    /** id of the element that describes the dialog (for aria-describedby). */
    describedBy?: string;
    className?: string;
}

const SIZE_CLASS: Record<ModalSize, string> = {
    sm: styles.sizeSm,
    md: styles.sizeMd,
    lg: styles.sizeLg,
};

const TONE_CLASS: Record<ModalTone, string> = {
    info: styles.toneInfo,
    success: styles.toneSuccess,
    warning: styles.toneWarning,
    danger: styles.toneDanger,
};

const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Generic themed popup used by every dialog in the app.
 * Renders in a portal on document.body, locks background scroll, traps Tab and
 * restores focus on close.
 */
const Modal = ({
    open = true,
    onClose,
    title,
    eyebrow,
    icon,
    tone = "info",
    size = "sm",
    children,
    footer,
    hideCloseButton = false,
    closeOnOverlayClick = true,
    closeOnEscape = true,
    describedBy,
    className,
}: ModalProps) => {
    const titleId = `${useId()}-title`;
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open || !closeOnEscape || !onClose) {
            return;
        }
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [closeOnEscape, onClose, open]);

    useEffect(() => {
        if (!open) {
            return;
        }
        restoreFocusRef.current = document.activeElement as HTMLElement | null;
        const dialog = dialogRef.current;
        // `autoFocus` on an action button wins; otherwise focus the dialog.
        if (dialog && !dialog.contains(document.activeElement)) {
            (dialog.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? dialog).focus();
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = previousOverflow;
            restoreFocusRef.current?.focus?.();
        };
    }, [open]);

    if (!open) {
        return null;
    }

    const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Tab") {
            return;
        }
        const dialog = dialogRef.current;
        if (!dialog) {
            return;
        }
        const focusable = Array.from(
            dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        );
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
            if (active === first || !dialog.contains(active)) {
                event.preventDefault();
                last.focus();
            }
            return;
        }
        if (active === last || !dialog.contains(active)) {
            event.preventDefault();
            first.focus();
        }
    };

    return createPortal(
        <div
            className={styles.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && closeOnOverlayClick) {
                    onClose?.();
                }
            }}
        >
            <div
                ref={dialogRef}
                className={[styles.modal, SIZE_CLASS[size], TONE_CLASS[tone], className]
                    .filter(Boolean)
                    .join(" ")}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={describedBy}
                tabIndex={-1}
                onKeyDown={handleTabKey}
                // Lets the stylesheet line the body copy up with the title.
                data-has-icon={icon ? "true" : "false"}
            >
                <div className={styles.header}>
                    {icon ? (
                        <span className={styles.icon} aria-hidden="true">
                            {icon}
                        </span>
                    ) : null}
                    <div className={styles.titleGroup}>
                        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
                        {title ? (
                            <h2 className={styles.title} id={titleId}>
                                {title}
                            </h2>
                        ) : null}
                    </div>
                    {hideCloseButton ? null : (
                        <button
                            type="button"
                            className={styles.closeButton}
                            onClick={() => onClose?.()}
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
                {children ? <div className={styles.body}>{children}</div> : null}
                {footer ? <div className={styles.actions}>{footer}</div> : null}
            </div>
        </div>,
        document.body,
    );
};

export default Modal;
