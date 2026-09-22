from app.services.store_permissions import (
    default_new_manager_permissions,
    permissions_for_staff_doc,
    user_has_permission,
)


def test_existing_manager_without_permissions_keeps_full_access():
    user = {"role": "store_manager"}
    assert permissions_for_staff_doc(user)["inventory"] is True
    assert user_has_permission({**user, "permissions": None}, "inventory")
    assert user_has_permission({**user, "permissions": None}, "orders")


def test_new_manager_defaults_to_read_only():
    granted = default_new_manager_permissions()
    assert granted["read"] is True
    assert granted["inventory"] is False
    assert granted["orders"] is False
    assert granted["products_update"] is False
    assert granted["coupons"] is False


def test_explicit_permissions_are_enforced():
    current_user = {
        "role": "store_manager",
        "permissions": {
            "read": True,
            "orders": True,
            "inventory": False,
            "products_update": True,
            "coupons": True,
        },
    }
    assert user_has_permission(current_user, "orders")
    assert user_has_permission(current_user, "products_update")
    assert user_has_permission(current_user, "coupons")
    assert not user_has_permission(current_user, "inventory")


def test_store_owner_bypasses_permission_flags():
    assert user_has_permission({"role": "admin"}, "inventory")
    assert user_has_permission({"role": "super_admin"}, "coupons")
