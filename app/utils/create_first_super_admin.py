import sys
from pathlib import Path
# Make project root available
PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(
        0,
        str(PROJECT_ROOT),
    )
from datetime import datetime
from app.database.mongo import users
from app.utils.hash import hash_password
EMAIL = "superadmin@example.com"
PASSWORD = "Admin@123456"
NAME = "Super Admin"
existing = users.find_one(
    {
        "email": EMAIL.lower(),
    }
)
if existing:
    print("Super Admin already exists.")
    sys.exit(0)
now = datetime.utcnow()
payload = {
    "tenantId": None,
    "name": NAME,
    "email": EMAIL.lower(),
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
print("Password:", PASSWORD)
print("=" * 50)
