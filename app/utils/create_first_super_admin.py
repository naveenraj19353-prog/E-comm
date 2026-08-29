"""
Bootstrap the first platform super admin.

Usage:
  SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_PASSWORD='your-secure-password' \\
    python -m app.utils.create_first_super_admin

Optional:
  SUPER_ADMIN_NAME="Super Admin"
"""

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from datetime import datetime

from app.database.mongo import users
from app.utils.hash import hash_password

EMAIL = os.environ.get("SUPER_ADMIN_EMAIL", "").strip().lower()
PASSWORD = os.environ.get("SUPER_ADMIN_PASSWORD", "")
NAME = os.environ.get("SUPER_ADMIN_NAME", "Super Admin").strip()


def main() -> None:
    if not EMAIL or not PASSWORD:
        print("Missing required environment variables.")
        print("Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD, then rerun.")
        print()
        print("Example:")
        print("  SUPER_ADMIN_EMAIL=admin@example.com \\")
        print("  SUPER_ADMIN_PASSWORD='ChangeMe123!' \\")
        print("  python -m app.utils.create_first_super_admin")
        sys.exit(1)

    if len(PASSWORD) < 8:
        print("SUPER_ADMIN_PASSWORD must be at least 8 characters.")
        sys.exit(1)

    existing = users.find_one({"email": EMAIL})
    if existing:
        if existing.get("role") == "super_admin":
            print(f"Super admin already exists for {EMAIL}.")
            sys.exit(0)
        print(f"Email {EMAIL} is already used by another account.")
        sys.exit(1)

    now = datetime.utcnow()
    payload = {
        "tenantId": None,
        "name": NAME or "Super Admin",
        "email": EMAIL,
        "phone": None,
        "password": hash_password(PASSWORD),
        "role": "super_admin",
        "isActive": True,
        "createdAt": now,
        "updatedAt": now,
    }
    result = users.insert_one(payload)
    print("=" * 50)
    print("FIRST SUPER ADMIN CREATED")
    print("=" * 50)
    print("ID:", result.inserted_id)
    print("Email:", EMAIL)
    print("Name:", payload["name"])
    print("=" * 50)
    print("Sign in at the admin login with an empty Tenant ID field.")


if __name__ == "__main__":
    main()
