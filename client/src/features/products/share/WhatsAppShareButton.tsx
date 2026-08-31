import { useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { useStorefrontTenant } from "../../tenant/useTenant";
import {
    buildProductShareUrl,
    buildWhatsAppMessage,
    createWhatsAppShareCard,
    getProductImageForColor,
    isShareUrlLocalhost,
    shareProductOnWhatsApp,
} from "../share/whatsappShare";
import styles from "./WhatsAppShareButton.module.css";

interface WhatsAppShareButtonProps {
    productId: string;
    productName: string;
    price?: number;
    imageUrl?: string;
    className?: string;
}

export default function WhatsAppShareButton({
    productId,
    productName,
    price,
    imageUrl,
    className = "",
}: WhatsAppShareButtonProps) {
    const { tenantSlug } = useStorefrontTenant();
    const [feedback, setFeedback] = useState("");
    const imageFileRef = useRef<File | null>(null);

    useEffect(() => {
        let cancelled = false;
        imageFileRef.current = null;
        setFeedback("");

        if (!imageUrl || !tenantSlug) {
            return undefined;
        }

        const shareUrl = buildProductShareUrl(tenantSlug, productId);
        const safeName = productName.replace(/[^\w.-]+/g, "-").slice(0, 40);

        void createWhatsAppShareCard({
            imageUrl,
            productName,
            productUrl: shareUrl,
            price,
            fileName: `${safeName || "product"}.jpg`,
        })
            .then((file) => {
                if (!cancelled) {
                    imageFileRef.current = file;
                }
            })
            .catch(() => {
                if (!cancelled) {
                    imageFileRef.current = null;
                }
            });

        return () => {
            cancelled = true;
        };
    }, [imageUrl, productName, price, productId, tenantSlug]);

    const handleClick = () => {
        if (!tenantSlug) {
            setFeedback("Store link unavailable.");
            return;
        }

        const shareUrl = buildProductShareUrl(tenantSlug, productId);
        const message = buildWhatsAppMessage(productName, shareUrl, price);
        const method = shareProductOnWhatsApp({
            imageFile: imageFileRef.current,
            message,
        });

        if (method === "clipboard-image") {
            setFeedback(
                isShareUrlLocalhost(shareUrl)
                    ? "WhatsApp opened. Paste the image (Ctrl+V). Set VITE_PUBLIC_URL in client/.env so the link works for others."
                    : "WhatsApp opened with the link. Paste the product image in the same chat (Ctrl+V).",
            );
            return;
        }
        setFeedback(
            isShareUrlLocalhost(shareUrl)
                ? "WhatsApp opened. Set VITE_PUBLIC_URL in client/.env to share a public link."
                : "WhatsApp opened with the product link.",
        );
    };

    return (
        <div className={className}>
            <button
                type="button"
                className={styles.button}
                onClick={handleClick}
                aria-label={`Share ${productName} on WhatsApp`}
                title="Share on WhatsApp"
            >
                <FaWhatsapp size={20} />
            </button>
            {feedback && (
                <p className={styles.feedback} role="status">
                    {feedback}
                </p>
            )}
        </div>
    );
}

export { getProductImageForColor };
