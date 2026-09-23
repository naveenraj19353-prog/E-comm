import { useState } from "react";
import axios from "axios";
import { submitContactMessage } from "../../features/contact/api/contact.api";
import styles from "./LegalPage.module.css";

type ContactFormProps = {
    tenantId: string;
    storeName: string;
};

const ContactForm = ({ tenantId, storeName }: ContactFormProps) => {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [sent, setSent] = useState(false);
    const [pending, setPending] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setPending(true);
        try {
            await submitContactMessage({
                tenantId,
                name: name.trim(),
                email: email.trim(),
                message: message.trim(),
            });
            setSent(true);
            setName("");
            setEmail("");
            setMessage("");
        } catch (err) {
            const detail = axios.isAxiosError(err) ? err.response?.data?.detail : undefined;
            setError(
                typeof detail === "string"
                    ? detail
                    : "Unable to send your message. Please try again.",
            );
        } finally {
            setPending(false);
        }
    };

    if (!tenantId) {
        return (
            <p className={styles.formNote}>This store is not ready to receive messages yet.</p>
        );
    }

    if (sent) {
        return (
            <div className={styles.formSuccess}>
                <strong>Message sent</strong>
                <p>
                    {storeName} can see this in the store admin inbox and can reply to the
                    email you entered.
                </p>
                <button type="button" className={styles.submit} onClick={() => setSent(false)}>
                    Send another
                </button>
            </div>
        );
    }

    return (
        <form className={styles.form} onSubmit={handleSubmit}>
            <label>
                <span>Name</span>
                <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    required
                    autoComplete="name"
                />
            </label>
            <label>
                <span>Email</span>
                <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                />
            </label>
            <label>
                <span>Message</span>
                <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    minLength={10}
                    maxLength={2000}
                    required
                    rows={5}
                    placeholder="How can the store help?"
                />
            </label>
            {error ? <p className={styles.formError}>{error}</p> : null}
            <button type="submit" className={styles.submit} disabled={pending}>
                {pending ? "Sending..." : "Send message"}
            </button>
        </form>
    );
};

export default ContactForm;
