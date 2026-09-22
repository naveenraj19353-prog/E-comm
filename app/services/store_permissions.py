PERMISSION_KEYS = (
    "read",
    "products_update",
    "inventory",
    "orders",
    "coupons",
    "customers",
    "banners",
    "shipping",
    "whatsapp",
    "layout",
    "menu",
)

PERMISSION_CATALOG = (
    {"key": "read", "label": "Read catalog"},
    {"key": "products_update", "label": "Product update"},
    {"key": "inventory", "label": "Inventory"},
    {"key": "orders", "label": "Order management"},
    {"key": "coupons", "label": "Coupons"},
    {"key": "customers", "label": "Customers"},
    {"key": "banners", "label": "Banners"},
    {"key": "shipping", "label": "Shipping"},
    {"key": "whatsapp", "label": "WhatsApp"},
    {"key": "layout", "label": "Layout studio"},
    {"key": "menu", "label": "Menu desk"},
)

OWNER_ROLES = ("admin", "super_admin")


def all_granted() -> dict[str, bool]:
    return {key: True for key in PERMISSION_KEYS}


def default_new_manager_permissions() -> dict[str, bool]:
    granted = {key: False for key in PERMISSION_KEYS}
    granted["read"] = True
    return granted


def normalize_permissions(
    raw,
    *,
    missing_means_full: bool,
) -> dict[str, bool]:
    if raw is None:
        return all_granted() if missing_means_full else default_new_manager_permissions()
    if not isinstance(raw, dict):
        return all_granted() if missing_means_full else default_new_manager_permissions()
    return {key: bool(raw.get(key)) for key in PERMISSION_KEYS}


def permissions_for_staff_doc(user: dict | None) -> dict[str, bool]:
    if not user:
        return default_new_manager_permissions()
    if "permissions" not in user or user.get("permissions") is None:
        return all_granted()
    return normalize_permissions(user.get("permissions"), missing_means_full=False)


def user_has_permission(current_user: dict | None, permission: str) -> bool:
    if not current_user:
        return False
    role = current_user.get("role")
    if role in OWNER_ROLES:
        return True
    if role != "store_manager":
        return False
    if permission not in PERMISSION_KEYS:
        return False
    perms = current_user.get("permissions")
    if perms is None:
        return True
    if not isinstance(perms, dict):
        return True
    return bool(perms.get(permission))
