import { useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { useStorefrontTenant } from "../../tenant/useTenant";
import { routes } from "../../../routes/routes";
import {
    buildWhatsAppMessage,
    createWhatsAppShareCard,
    getProductImageForColor,
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

        const productUrl = `${window.location.origin}${routes.product(tenantSlug, productId)}`;
        const safeName = productName.replace(/[^\w.-]+/g, "-").slice(0, 40);

        void createWhatsAppShareCard({
            imageUrl,
            productName,
            productUrl,
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

        const productUrl = `${window.location.origin}${routes.product(tenantSlug, productId)}`;
        const message = buildWhatsAppMessage(productName, productUrl, price);
        const method = shareProductOnWhatsApp({
            imageFile: imageFileRef.current,
            message,
        });

        if (method === "native-image") {
            setFeedback("Choose WhatsApp — image and link will be shared together.");
            return;
        }
        if (method === "clipboard-image") {
            setFeedback("WhatsApp opened with the link. Paste the product image in the same chat (Ctrl+V). The link is also printed on the image.");
            return;
        }
        if (method === "download-image") {
            setFeedback("WhatsApp opened with the link. Attach the downloaded image in the same chat.");
            return;
        }
        setFeedback("WhatsApp opened with the product link.");
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
