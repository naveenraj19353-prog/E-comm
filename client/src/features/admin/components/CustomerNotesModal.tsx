import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addCustomerNote, deleteCustomerNote, getCustomerNotes } from "../api/customer.api";
import styles from "../styles/StockAdjustModal.module.css";

type Props = {
    tenantId: string;
    customerId: string;
    customerName: string;
    onClose: () => void;
};

const MAX_NOTE_LENGTH = 1000;

const errorMessage = (error: unknown, fallback: string): string => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === "string" ? detail : fallback;
};

/** Internal notes staff keep about a customer (REQ-065). The customer never sees them. */
export default function CustomerNotesModal({ tenantId, customerId, customerName, onClose }: Props) {
    const queryClient = useQueryClient();
    const [text, setText] = useState("");
    const notesKey = ["admin-customer-notes", tenantId, customerId];
    const notesQuery = useQuery({ queryKey: notesKey, queryFn: () => getCustomerNotes(tenantId, customerId) });

    const addMutation = useMutation({
        mutationFn: () => addCustomerNote(tenantId, customerId, text.trim()),
        onSuccess: () => {
            setText("");
            queryClient.invalidateQueries({ queryKey: notesKey });
        },
    });
    const deleteMutation = useMutation({
        mutationFn: (noteId: string) => deleteCustomerNote(tenantId, customerId, noteId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: notesKey }),
    });

    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        if (text.trim() && !addMutation.isPending) {
            addMutation.mutate();
        }
    };

    return (
        <div
            className={styles.overlay}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="customer-notes-title">
                <div className={styles.header}>
                    <div>
                        <span className={styles.eyebrow}>Internal notes</span>
                        <h2 id="customer-notes-title">{customerName}</h2>
                    </div>
                    <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className={styles.body}>
                    <form className={styles.form} onSubmit={submit}>
                        <label className={styles.field} style={{ gridColumn: "1 / -1" }}>
                            <span>Add a note (only staff can see notes)</span>
                            <input
                                type="text"
                                value={text}
                                maxLength={MAX_NOTE_LENGTH}
                                onChange={(event) => setText(event.target.value)}
                                placeholder="e.g. Prefers delivery after 6 pm"
                                aria-label="Note"
                            />
                        </label>
                        {addMutation.isError ? (
                            <p className={styles.error}>{errorMessage(addMutation.error, "Could not save the note.")}</p>
                        ) : null}
                        <div className={styles.actions}>
                            <button type="button" className={styles.secondary} onClick={onClose}>
                                Close
                            </button>
                            <button type="submit" className={styles.primary} disabled={!text.trim() || addMutation.isPending}>
                                {addMutation.isPending ? "Saving…" : "Add note"}
                            </button>
                        </div>
                    </form>

                    <section className={styles.history}>
                        <h3>Notes</h3>
                        {deleteMutation.isError ? (
                            <p className={styles.error}>{errorMessage(deleteMutation.error, "Could not delete the note.")}</p>
                        ) : null}
                        {notesQuery.isLoading ? (
                            <p className={styles.muted}>Loading…</p>
                        ) : notesQuery.isError ? (
                            <p className={styles.error}>Could not load notes.</p>
                        ) : !notesQuery.data?.length ? (
                            <p className={styles.muted}>No notes yet.</p>
                        ) : (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>When</th>
                                            <th>Note</th>
                                            <th>By</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notesQuery.data.map((note) => (
                                            <tr key={note.id}>
                                                <td>
                                                    {new Date(note.createdAt).toLocaleString("en-IN", {
                                                        day: "numeric",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })}
                                                </td>
                                                <td>{note.text}</td>
                                                <td>{note.authorName}</td>
                                                <td>
                                                    {note.canDelete ? (
                                                        <button
                                                            type="button"
                                                            className={styles.secondary}
                                                            onClick={() => deleteMutation.mutate(note.id)}
                                                            disabled={deleteMutation.isPending}
                                                        >
                                                            Delete
                                                        </button>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
