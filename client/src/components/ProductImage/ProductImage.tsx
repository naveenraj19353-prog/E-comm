import { useEffect, useState, type ImgHTMLAttributes, type ReactNode, type SyntheticEvent } from "react";
import { DEFAULT_PRODUCT_IMAGE } from "../../constants/images";
import styles from "./ProductImage.module.css";

export interface ProductImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
    src?: string | null;
    fallbackSrc?: string;
    placeholderLabel?: string;
    placeholder?: ReactNode;
}

export default function ProductImage({
    src,
    fallbackSrc = DEFAULT_PRODUCT_IMAGE,
    alt = "",
    className,
    placeholderLabel = "No image",
    placeholder,
    onError,
    ...rest
}: ProductImageProps) {
    const normalizedSrc = typeof src === "string" ? src.trim() : "";
    const [currentSrc, setCurrentSrc] = useState(
        normalizedSrc || fallbackSrc,
    );
    const [showPlaceholder, setShowPlaceholder] = useState(false);

    useEffect(() => {
        setShowPlaceholder(false);
        setCurrentSrc(normalizedSrc || fallbackSrc);
    }, [normalizedSrc, fallbackSrc]);

    const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
        onError?.(event);
        if (currentSrc !== fallbackSrc) {
            setCurrentSrc(fallbackSrc);
            return;
        }
        setShowPlaceholder(true);
    };

    if (showPlaceholder) {
        if (placeholder) {
            return <>{placeholder}</>;
        }
        return (
            <div
                className={[styles.placeholder, className].filter(Boolean).join(" ")}
                aria-label={alt || placeholderLabel}
                role="img"
            >
                <span className={styles.placeholderIcon} aria-hidden="true" />
                <span className={styles.placeholderText}>{placeholderLabel}</span>
            </div>
        );
    }

    return (
        <img
            {...rest}
            src={currentSrc}
            alt={alt}
            className={className}
            onError={handleError}
        />
    );
}
