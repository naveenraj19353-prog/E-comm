import { useEffect, useRef, useState, type ImgHTMLAttributes, type ReactNode, type SyntheticEvent } from "react";
import { DEFAULT_PRODUCT_IMAGE } from "../../constants/images";
import { isVideoSrc } from "../../utils/mediaSrc";
import styles from "./ProductImage.module.css";

export interface ProductImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
    src?: string | null;
    fallbackSrc?: string;
    placeholderLabel?: string;
    placeholder?: ReactNode;
    autoPlay?: boolean;
}

export default function ProductImage({
    src,
    fallbackSrc = DEFAULT_PRODUCT_IMAGE,
    alt = "",
    className,
    placeholderLabel = "No image",
    placeholder,
    onError,
    autoPlay = true,
    ...rest
}: ProductImageProps) {
    const normalizedSrc = typeof src === "string" ? src.trim() : "";
    const [currentSrc, setCurrentSrc] = useState(
        normalizedSrc || fallbackSrc,
    );
    const [showPlaceholder, setShowPlaceholder] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        setShowPlaceholder(false);
        setCurrentSrc(normalizedSrc || fallbackSrc);
    }, [normalizedSrc, fallbackSrc]);

    const video = isVideoSrc(currentSrc);

    useEffect(() => {
        const node = videoRef.current;
        if (!node || !video) return;
        node.muted = true;
        node.defaultMuted = true;
        node.playsInline = true;
        node.setAttribute("playsinline", "true");
        node.setAttribute("webkit-playsinline", "true");
        if (autoPlay) {
            const play = () => void node.play().catch(() => undefined);
            if (node.readyState >= 2) {
                play();
            } else {
                node.addEventListener("canplay", play, { once: true });
                return () => node.removeEventListener("canplay", play);
            }
        } else {
            node.pause();
        }
    }, [autoPlay, video, currentSrc]);

    const handleError = (event: SyntheticEvent<HTMLImageElement | HTMLVideoElement, Event>) => {
        onError?.(event as SyntheticEvent<HTMLImageElement, Event>);
        if (currentSrc !== fallbackSrc && !isVideoSrc(fallbackSrc)) {
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

    if (video) {
        return (
            <video
                ref={videoRef}
                src={currentSrc}
                className={className}
                muted
                loop
                playsInline
                autoPlay={autoPlay}
                preload="auto"
                aria-label={alt}
                onError={handleError}
            />
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
