export const getProductImageForColor = (
    images: Record<string, string[]> | undefined,
    color?: string,
) => {
    if (color && images?.[color]?.[0]) {
        return images[color][0];
    }
    return Object.values(images ?? {})
        .flat()
        .find((value) => typeof value === "string" && value.trim())?.trim() || "";
};

const loadImage = (source: string) => {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unable to load product image."));
        if (!source.startsWith("data:")) {
            image.crossOrigin = "anonymous";
        }
        image.src = source;
    });
};

const wrapText = (
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
) => {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = words[0] || "";

    for (let index = 1; index < words.length; index += 1) {
        const candidate = `${currentLine} ${words[index]}`;
        if (context.measureText(candidate).width <= maxWidth) {
            currentLine = candidate;
        }
        else {
            lines.push(currentLine);
            currentLine = words[index];
        }
    }
    lines.push(currentLine);
    return lines;
};

export interface WhatsAppShareCardInput {
    imageUrl: string;
    productName: string;
    productUrl: string;
    price?: number;
    fileName: string;
}

/** Product photo + name + price + link burned into one shareable image. */
export const createWhatsAppShareCard = async ({
    imageUrl,
    productName,
    productUrl,
    price,
    fileName,
}: WhatsAppShareCardInput) => {
    if (!imageUrl.trim()) {
        return null;
    }

    const width = 1080;
    const imageHeight = 860;
    const footerHeight = 320;
    const height = imageHeight + footerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        return null;
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    try {
        const productImage = await loadImage(imageUrl);
        const scale = Math.max(width / productImage.width, imageHeight / productImage.height);
        const drawWidth = productImage.width * scale;
        const drawHeight = productImage.height * scale;
        const offsetX = (width - drawWidth) / 2;
        const offsetY = (imageHeight - drawHeight) / 2;
        context.drawImage(productImage, offsetX, offsetY, drawWidth, drawHeight);
    }
    catch {
        context.fillStyle = "#edf0ee";
        context.fillRect(0, 0, width, imageHeight);
    }

    context.fillStyle = "#ffffff";
    context.fillRect(0, imageHeight, width, footerHeight);
    context.fillStyle = "#e1e7e3";
    context.fillRect(0, imageHeight, width, 2);

    let cursorY = imageHeight + 48;
    context.fillStyle = "#17211d";
    context.font = "bold 44px Arial, sans-serif";
    const titleLines = wrapText(context, productName, width - 128);
    titleLines.slice(0, 2).forEach((line) => {
        context.fillText(line, 64, cursorY);
        cursorY += 52;
    });

    if (typeof price === "number") {
        context.fillStyle = "#2f6b52";
        context.font = "bold 40px Arial, sans-serif";
        context.fillText(`₹${price.toLocaleString("en-IN")}`, 64, cursorY + 8);
        cursorY += 56;
    }

    context.fillStyle = "#2563eb";
    context.font = "28px Arial, sans-serif";
    const linkLines = wrapText(context, productUrl, width - 128);
    linkLines.slice(0, 3).forEach((line) => {
        context.fillText(line, 64, cursorY);
        cursorY += 36;
    });

    const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) {
        return null;
    }
    return new File([blob], fileName, { type: "image/jpeg" });
};

export const buildWhatsAppMessage = (
    productName: string,
    productUrl: string,
    price?: number,
) => {
    const priceText = typeof price === "number"
        ? ` - ₹${price.toLocaleString("en-IN")}`
        : "";
    return `Check out ${productName}${priceText}\n${productUrl}`;
};

const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

/** Public URL for WhatsApp links — never localhost when a deploy URL is configured. */
export const buildProductShareUrl = (tenantSlug: string, productId: string) => {
    const sharePath = `/share/${tenantSlug}/product/${productId}`;

    const publicSite = import.meta.env.VITE_PUBLIC_URL?.trim().replace(/\/$/, "");
    if (publicSite) {
        return `${publicSite}/api${sharePath}`;
    }

    const origin = window.location.origin;
    if (!LOCAL_ORIGIN_PATTERN.test(origin)) {
        return `${origin}/api${sharePath}`;
    }

    const apiBase = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, "");
    if (apiBase && !apiBase.startsWith("/")) {
        return `${apiBase}${sharePath}`;
    }

    return `${origin}/api${sharePath}`;
};

export const isShareUrlLocalhost = (url: string) => {
    return LOCAL_ORIGIN_PATTERN.test(new URL(url, window.location.origin).origin);
};

export const isMobileDevice = () => {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
};

export const openWhatsApp = (message: string) => {
    const encoded = encodeURIComponent(message);
    const url = isMobileDevice()
        ? `https://wa.me/?text=${encoded}`
        : `https://web.whatsapp.com/send?text=${encoded}`;

    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (!popup) {
        window.location.assign(url);
    }
};

export const downloadShareFile = (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
};

export const copyImageToClipboard = async (file: File) => {
    const blob = file.slice(0, file.size, file.type || "image/jpeg");
    await navigator.clipboard.write([
        new ClipboardItem({
            [blob.type]: blob,
        }),
    ]);
};

export const canShareImageFile = (file: File) => {
    if (!navigator.canShare) {
        return false;
    }
    try {
        return navigator.canShare({ files: [file] });
    }
    catch {
        return false;
    }
};

export type WhatsAppShareMethod =
    | "clipboard-image"
    | "download-image"
    | "text-only";

export const shareProductOnWhatsApp = ({
    imageFile,
    message,
}: {
    imageFile: File | null;
    message: string;
}): WhatsAppShareMethod => {
    openWhatsApp(message);

    if (!imageFile) {
        return "text-only";
    }

    void copyImageToClipboard(imageFile)
        .then(() => undefined)
        .catch(() => {
            downloadShareFile(imageFile);
        });

    return "clipboard-image";
};
