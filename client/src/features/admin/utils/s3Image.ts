export type ProductImageRef = {
    key: string;
    previewUrl: string;
    name?: string;
};

const S3_KEY_PATTERN =
    /^tenants\/[a-zA-Z0-9_-]+\/(products|banners)\/[^/\\]+$/;

export const isS3ObjectKey = (value: string) =>
    S3_KEY_PATTERN.test(value.trim());

/** Extract a tenant S3 object key from a raw key or presigned/public S3 URL. */
export const extractS3ObjectKey = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    if (isS3ObjectKey(trimmed)) {
        return trimmed;
    }
    try {
        const url = new URL(trimmed);
        const path = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
        if (isS3ObjectKey(path)) {
            return path;
        }
    }
    catch {
        // Not a URL.
    }
    return null;
};

/** Normalize an API image value (presigned URL, key, or legacy data URL) for the admin form. */
export const toProductImageRef = (value: string): ProductImageRef | null => {
    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }
    const key = extractS3ObjectKey(trimmed);
    if (key) {
        const isDisplayable =
            /^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:");
        return {
            key,
            previewUrl: isDisplayable ? trimmed : "",
        };
    }
    if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
        return {
            key: "",
            previewUrl: trimmed,
        };
    }
    return null;
};

export const imageRefsToKeys = (
    images: Record<string, ProductImageRef[]>,
): Record<string, string[]> => {
    return Object.fromEntries(
        Object.entries(images)
            .map(([color, refs]) => [
                color,
                refs.map((ref) => ref.key.trim()).filter(Boolean),
            ] as const)
            .filter(([, keys]) => keys.length > 0),
    );
};

export const hasUnresolvedImageRefs = (
    images: Record<string, ProductImageRef[]>,
) => {
    return Object.values(images).some((refs) =>
        refs.some((ref) => !ref.key.trim()),
    );
};
