import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
    getAdminContactMessages,
    markAdminContactRead,
    type ContactMessage,
} from "../../contact/api/contact.api";
import { formatOrderDate } from "../../orders/api/order.api";
import styles from "../styles/AdminCustomers.module.css";

function errMsg(err: unknown) {
    if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
        return err.response.data.detail;
    }
    return "Unable to update the message.";
}

export default function AdminContactMessages() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string>("");

    const messagesQuery = useQuery({
        queryKey: ["admin", "contact", tenantId],
        queryFn: () => getAdminContactMessages(tenantId),
        enabled: Boolean(tenantId),
    });

    const readMutation = useMutation({
        mutationFn: (messageId: string) => markAdminContactRead(messageId, tenantId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin", "contact", tenantId] });
        },
    });

    const messages = useMemo(() => {
        const query = search.trim().toLowerCase();
        const rows = messagesQuery.data || [];
        if (!query) {
            return rows;
        }
        return rows.filter((item) =>
            [item.name, item.email, item.message].some((value) =>
                String(value || "").toLowerCase().includes(query),
            ),
        );
    }, [messagesQuery.data, search]);

    const selected =
        messages.find((item) => item.id === selectedId) || messages[0] || null;

    const unread = (messagesQuery.data || []).filter((item) => item.status !== "read").length;

    const openMessage = async (item: ContactMessage) => {
        setSelectedId(item.id);
        if (item.status !== "read") {
            try {
                await readMutation.mutateAsync(item.id);
            } catch {
                // list still shows; mutation error is surfaced below
            }
        }
    };

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => navigate(`/admin/tenants/${tenantId}`)}
                    >
                        ← Back
                    </button>
                    <span className={styles.eyebrow}>INBOX</span>
                    <h1>Contact messages</h1>
                    <p>
                        Messages sent from the store Contact page
                        {unread ? ` · ${unread} unread` : ""}.
                    </p>
                </div>
                <input
                    className={styles.search}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, email or message"
                />
            </header>

            {messagesQuery.isLoading ? (
                <div className={styles.state}>Loading messages...</div>
            ) : messagesQuery.isError ? (
                <div className={styles.state}>Unable to load messages.</div>
            ) : messages.length === 0 ? (
                <div className={styles.state}>No contact messages yet.</div>
            ) : (
                <div className={styles.tableWrap}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>From</th>
                                <th>Message</th>
                                <th>Received</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {messages.map((item) => (
                                <tr
                                    key={item.id}
                                    onClick={() => void openMessage(item)}
                                    style={{
                                        cursor: "pointer",
                                        background:
                                            selected?.id === item.id ? "#f7faf8" : undefined,
                                    }}
                                >
                                    <td>
                                        <strong>{item.name}</strong>
                                        <div>{item.email}</div>
                                    </td>
                                    <td>{item.message.slice(0, 140)}{item.message.length > 140 ? "…" : ""}</td>
                                    <td>{formatOrderDate(item.createdAt)}</td>
                                    <td>{item.status === "read" ? "Read" : "New"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {selected ? (
                <section className={styles.tableWrap} style={{ marginTop: "1rem", padding: "1rem 1.1rem" }}>
                    <p className={styles.eyebrow}>MESSAGE</p>
                    <h2 style={{ margin: "0.35rem 0" }}>{selected.name}</h2>
                    <p>
                        {selected.email}
                        {" · "}
                        {formatOrderDate(selected.createdAt)}
                    </p>
                    <p style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}>{selected.message}</p>
                    {readMutation.isError ? <p>{errMsg(readMutation.error)}</p> : null}
                </section>
            ) : null}
        </div>
    );
}
