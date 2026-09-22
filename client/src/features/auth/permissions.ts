import type { User } from "./types";

export const STORE_PERMISSIONS = [
    { key: "read", label: "Read catalog" },
    { key: "products_update", label: "Product update" },
    { key: "inventory", label: "Inventory" },
    { key: "orders", label: "Order management" },
    { key: "coupons", label: "Coupons" },
    { key: "customers", label: "Customers" },
    { key: "banners", label: "Banners" },
    { key: "shipping", label: "Shipping" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "layout", label: "Layout studio" },
    { key: "menu", label: "Menu desk" },
] as const;

export type StorePermission = (typeof STORE_PERMISSIONS)[number]["key"];

export type StorePermissionMap = Record<StorePermission, boolean>;

export function defaultNewManagerPermissions(): StorePermissionMap {
    return STORE_PERMISSIONS.reduce((acc, item) => {
        acc[item.key] = item.key === "read";
        return acc;
    }, {} as StorePermissionMap);
}

export function hasStorePermission(
    user: User | null | undefined,
    permission: StorePermission,
): boolean {
    if (!user) {
        return false;
    }
    if (user.role === "admin" || user.role === "super_admin") {
        return true;
    }
    if (user.role !== "store_manager") {
        return false;
    }
    const permissions = user.permissions;
    if (!permissions) {
        return true;
    }
    return Boolean(permissions[permission]);
}

export function hasAnyStorePermission(
    user: User | null | undefined,
    permissions: StorePermission[],
): boolean {
    return permissions.some((permission) => hasStorePermission(user, permission));
}
