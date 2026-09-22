export function isStoreStaff(role?: string | null) {
    return role === "admin" || role === "store_manager";
}

export function isStoreOwner(role?: string | null) {
    return role === "admin";
}

export function storeRoleLabel(role?: string | null) {
    if (role === "super_admin") {
        return "Super Admin";
    }
    if (role === "store_manager") {
        return "Store Manager";
    }
    if (role === "admin") {
        return "Store Admin";
    }
    return "User";
}
