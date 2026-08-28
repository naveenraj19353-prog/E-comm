from pymongo import ASCENDING, IndexModel
from app.database.mongo import (
    orders,
    payment_intents,
    users,
    carts,
)


def ensure_indexes() -> None:
    orders.create_indexes(
        [
            IndexModel(
                [("razorpayOrderId", ASCENDING)],
                unique=True,
                name="orders_razorpay_order_id_unique",
                partialFilterExpression={
                    "razorpayOrderId": {"$exists": True, "$type": "string"},
                },
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("userId", ASCENDING)],
                name="orders_tenant_user",
            ),
        ]
    )
    payment_intents.create_indexes(
        [
            IndexModel(
                [("razorpayOrderId", ASCENDING)],
                unique=True,
                name="payment_intents_razorpay_order_id_unique",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("userId", ASCENDING)],
                name="payment_intents_tenant_user",
            ),
        ]
    )
    users.create_indexes(
        [
            IndexModel(
                [("email", ASCENDING), ("tenantId", ASCENDING)],
                unique=True,
                name="users_email_tenant_unique",
                partialFilterExpression={
                    "email": {"$exists": True, "$type": "string"},
                },
            ),
        ]
    )
    carts.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("userId", ASCENDING)],
                name="carts_tenant_user",
            ),
        ]
    )
