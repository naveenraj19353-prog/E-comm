from pymongo import ASCENDING, DESCENDING, IndexModel
from app.database.mongo import (
    carts,
    messaging_integrations,
    notification_logs,
    orders,
    payment_intents,
    periskope_webhook_events,
    shipping_integrations,
    shipping_locations,
    shipments,
    users,
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
            IndexModel(
                [
                    ("tenantId", ASCENDING),
                    ("channel", ASCENDING),
                    ("counterNumber", ASCENDING),
                ],
                name="orders_tenant_channel_counter",
            ),
            IndexModel(
                [
                    ("tenantId", ASCENDING),
                    ("channel", ASCENDING),
                    ("orderStatus", ASCENDING),
                ],
                name="orders_tenant_channel_status",
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
            IndexModel(
                [("tenantId", ASCENDING), ("phone", ASCENDING)],
                unique=True,
                name="users_tenant_phone_unique",
                partialFilterExpression={
                    "phone": {"$exists": True, "$type": "string", "$gt": ""},
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
    shipping_integrations.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("provider", ASCENDING)],
                unique=True,
                name="shipping_integrations_tenant_provider_unique",
            ),
        ]
    )
    shipping_locations.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("provider", ASCENDING), ("name", ASCENDING)],
                unique=True,
                name="shipping_locations_tenant_provider_name_unique",
            ),
        ]
    )
    shipments.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("orderId", ASCENDING), ("provider", ASCENDING)],
                unique=True,
                name="shipments_tenant_order_provider_unique",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("awb", ASCENDING)],
                name="shipments_tenant_awb",
            ),
        ]
    )
    messaging_integrations.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("provider", ASCENDING)],
                unique=True,
                name="messaging_integrations_tenant_provider_unique",
            ),
        ]
    )
    notification_logs.create_indexes(
        [
            IndexModel(
                [("idempotencyKey", ASCENDING)],
                unique=True,
                name="notification_logs_idempotency_key_unique",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="notification_logs_tenant_created",
            ),
        ]
    )
    periskope_webhook_events.create_indexes(
        [
            IndexModel(
                [("eventHash", ASCENDING)],
                unique=True,
                name="periskope_webhook_event_hash_unique",
            ),
            IndexModel(
                [("receivedAt", DESCENDING)],
                name="periskope_webhook_events_received",
            ),
        ]
    )
