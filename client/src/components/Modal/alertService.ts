/**
 * Imperative, framework-agnostic entry point for the themed alert popup.
 *
 * Any module (component, hook, api helper) can call `showAlert(...)` /
 * `showConfirm(...)` without prop drilling. `AlertProvider` registers the
 * renderer; when no provider is mounted (unit tests, SSR, early bootstrap) the
 * calls degrade to the native browser dialogs instead of silently vanishing.
 */

export type AlertTone = "info" | "success" | "warning" | "danger";

export type AlertKind = "alert" | "confirm";

export interface AlertOptions {
    /** Dialog heading. Defaults to a tone-specific heading. */
    title?: string;
    tone?: AlertTone;
    /** Label of the primary button. */
    confirmLabel?: string;
    /** Label of the cancel button (confirm dialogs only). */
    cancelLabel?: string;
    /**
     * When false the dialog can only be answered with a button
     * (no close icon, no Escape, no overlay click).
     */
    dismissible?: boolean;
}

export interface AlertDialogRequest extends AlertOptions {
    kind: AlertKind;
    message: string;
    /** Stable id so the provider can re-key (and re-animate) each dialog. */
    id?: number;
}

/** Resolves with `true` when the user confirmed, `false` otherwise. */
export type AlertDialogHandler = (request: AlertDialogRequest) => Promise<boolean>;

let handler: AlertDialogHandler | null = null;

const nativeAlert = (message: string): void => {
    if (typeof window === "undefined" || typeof window.alert !== "function") {
        return;
    }
    try {
        window.alert(message);
    } catch {
        // jsdom and locked-down environments do not implement window.alert.
    }
};

const nativeConfirm = (message: string): boolean => {
    if (typeof window === "undefined" || typeof window.confirm !== "function") {
        // Nothing can answer, so do not block the caller's flow.
        return true;
    }
    try {
        return window.confirm(message);
    } catch {
        return true;
    }
};

/** Called by `<AlertProvider/>`; returns an unregister function. */
export const registerAlertDialogHandler = (next: AlertDialogHandler): (() => void) => {
    handler = next;
    return () => {
        if (handler === next) {
            handler = null;
        }
    };
};

/** Fire-and-forget message popup. Never rejects. */
export const showAlert = (message: string, options: AlertOptions = {}): Promise<void> => {
    if (!handler) {
        nativeAlert(message);
        return Promise.resolve();
    }
    return handler({ ...options, kind: "alert", message })
        .then(() => undefined)
        .catch(() => undefined);
};

/** Asks a yes/no question and resolves with the answer. Never rejects. */
export const showConfirm = (
    message: string,
    options: AlertOptions = {},
): Promise<boolean> => {
    if (!handler) {
        return Promise.resolve(nativeConfirm(message));
    }
    return handler({ ...options, kind: "confirm", message }).catch(() => false);
};

export interface AlertApi {
    showAlert: typeof showAlert;
    showConfirm: typeof showConfirm;
}

const ALERT_API: AlertApi = { showAlert, showConfirm };

/**
 * Ergonomic access to the same global service, e.g.
 * `const { showAlert, showConfirm } = useAlert();`
 * Safe to call outside `<AlertProvider/>`.
 */
export const useAlert = (): AlertApi => ALERT_API;

export const alertApi = ALERT_API;
