export interface InventoryStockItem {
    stock?: number | string | null;
}
export function getInventoryTotalStock(inventory?: InventoryStockItem[] | null): number {
    if (!Array.isArray(inventory)) {
        return 0;
    }
    return inventory.reduce((total, item) => {
        const stock = Number(item?.stock);
        if (!Number.isFinite(stock) || stock <= 0) {
            return total;
        }
        return total + stock;
    }, 0);
}
export function getProductTotalStock(product: {
    inventory?: InventoryStockItem[] | null;
    totalStock?: number | null;
    stock?: number | null;
}): number {
    if (Array.isArray(product.inventory) && product.inventory.length > 0) {
        return getInventoryTotalStock(product.inventory);
    }
    const totalStock = Number(product.totalStock);
    if (Number.isFinite(totalStock)) {
        return Math.max(0, totalStock);
    }
    const stock = Number(product.stock);
    if (Number.isFinite(stock)) {
        return Math.max(0, stock);
    }
    return 0;
}
export function isProductOutOfStock(product: {
    inventory?: InventoryStockItem[] | null;
    totalStock?: number | null;
    stock?: number | null;
}): boolean {
    return getProductTotalStock(product) <= 0;
}
export function getFirstProductImage(
    images?: Record<string, string[]> | ProductImageMap | string[] | null,
): string {
    if (Array.isArray(images)) {
        return images.find((image) => typeof image === "string" && image.trim()) || "";
    }
    if (!images || typeof images !== "object") {
        return "";
    }
    for (const colorImages of Object.values(images as ProductImageMap)) {
        if (typeof colorImages === "string" && colorImages.trim()) {
            return colorImages.trim();
        }
        if (!Array.isArray(colorImages)) {
            continue;
        }
        const image = colorImages.find((item) => typeof item === "string" && item.trim());
        if (image) {
            return image;
        }
    }
    return "";
}

type ProductImageMap = Record<string, string[] | string>;

export function getProductImagesForColor(
    images: ProductImageMap | undefined,
    color?: string | null,
): string[] {
    if (!images || typeof images !== "object") {
        return [];
    }

    const normalizedColor = color?.trim();
    if (normalizedColor) {
        const direct = images[normalizedColor];
        if (Array.isArray(direct)) {
            const resolved = direct.filter((item) => typeof item === "string" && item.trim());
            if (resolved.length > 0) {
                return resolved;
            }
        } else if (typeof direct === "string" && direct.trim()) {
            return [direct.trim()];
        }

        const caseMatch = Object.entries(images).find(
            ([key]) => key.trim().toLowerCase() === normalizedColor.toLowerCase(),
        );
        if (caseMatch) {
            const value = caseMatch[1];
            if (Array.isArray(value)) {
                const resolved = value.filter((item) => typeof item === "string" && item.trim());
                if (resolved.length > 0) {
                    return resolved;
                }
            } else if (typeof value === "string" && value.trim()) {
                return [value.trim()];
            }
        }
    }

    const fallback = getFirstProductImage(images as Record<string, string[]>);
    return fallback ? [fallback] : [];
}
