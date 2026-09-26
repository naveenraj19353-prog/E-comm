import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import AlertDialog from "./AlertDialog";
import {
    registerAlertDialogHandler,
    type AlertDialogRequest,
} from "./alertService";

interface PendingDialog {
    id: number;
    request: AlertDialogRequest;
    resolve: (confirmed: boolean) => void;
}

/**
 * Hosts the themed alert/confirm popup for the whole app. Mount once near the
 * root (see main.tsx); everything else talks to it through `showAlert` /
 * `showConfirm` from "./alertService".
 */
const AlertProvider = ({ children }: { children: ReactNode }) => {
    const [current, setCurrent] = useState<PendingDialog | null>(null);
    const queueRef = useRef<PendingDialog[]>([]);
    const nextIdRef = useRef(1);

    useEffect(() => {
        const unregister = registerAlertDialogHandler(
            (request) =>
                new Promise<boolean>((resolve) => {
                    queueRef.current.push({
                        id: nextIdRef.current++,
                        request,
                        resolve,
                    });
                    setCurrent(queueRef.current[0]);
                }),
        );
        return () => {
            unregister();
            const pending = queueRef.current;
            queueRef.current = [];
            setCurrent(null);
            // Never leave a caller awaiting a dialog that will not be shown.
            pending.forEach((item) => item.resolve(false));
        };
    }, []);

    // Keyed by id so a second click on the same dialog can never answer a
    // dialog that is still waiting in the queue.
    const settle = useCallback((id: number, confirmed: boolean) => {
        const index = queueRef.current.findIndex((item) => item.id === id);
        if (index === -1) {
            return;
        }
        const [answered] = queueRef.current.splice(index, 1);
        answered.resolve(confirmed);
        setCurrent(queueRef.current[0] ?? null);
    }, []);

    return (
        <>
            {children}
            {current ? (
                <AlertDialog
                    key={current.id}
                    request={current.request}
                    onResolve={(confirmed) => settle(current.id, confirmed)}
                />
            ) : null}
        </>
    );
};

export default AlertProvider;
