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
export function getFirstProductImage(images?: Record<string, string[]> | string[] | null): string {
    if (Array.isArray(images)) {
        return images.find((image) => typeof image === "string" && image.trim()) || "";
    }
    if (!images || typeof images !== "object") {
        return "";
    }
    for (const colorImages of Object.values(images)) {
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
