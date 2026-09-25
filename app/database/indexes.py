import logging

from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import OperationFailure
from app.database.mongo import (
    carts,
    contact_messages,
    customer_otps,
    ledger_entries,
    messaging_integrations,
    notification_logs,
    orders,
    payment_intents,
    payouts,
    periskope_webhook_events,
    products,
    rate_limits,
    shipping_integrations,
    shipping_locations,
    shipments,
    stock_movements,
    store_signup_otps,
    tenants,
    users,
    wishlists,
)

logger = logging.getLogger(__name__)


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
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="orders_tenant_created",
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
            IndexModel(
                [("status", ASCENDING), ("createdAt", ASCENDING)],
                name="payment_intents_status_created",
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
            # Admin customer list: {tenantId, role} sorted newest first, paged.
            IndexModel(
                [
                    ("tenantId", ASCENDING),
                    ("role", ASCENDING),
                    ("createdAt", DESCENDING),
                    ("_id", DESCENDING),
                ],
                name="users_tenant_role_created",
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
    contact_messages.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="contact_messages_tenant_created",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("email", ASCENDING), ("createdAt", DESCENDING)],
                name="contact_messages_tenant_email_created",
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
            # Delhivery push webhook looks shipments up by AWB alone.
            IndexModel(
                [("provider", ASCENDING), ("awb", ASCENDING)],
                name="shipments_provider_awb",
            ),
            # Background status sync: open shipments, oldest-checked first.
            IndexModel(
                [("provider", ASCENDING), ("syncDone", ASCENDING), ("lastSyncedAt", ASCENDING)],
                name="shipments_sync_queue",
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
    customer_otps.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("phone", ASCENDING), ("createdAt", DESCENDING)],
                name="customer_otps_tenant_phone_created",
            ),
            IndexModel(
                [("expiresAt", ASCENDING)],
                name="customer_otps_expires",
                expireAfterSeconds=0,
            ),
        ]
    )
    store_signup_otps.create_indexes(
        [
            IndexModel(
                [("email", ASCENDING), ("createdAt", DESCENDING)],
                name="store_signup_otps_email_created",
            ),
            IndexModel(
                [("expiresAt", ASCENDING)],
                name="store_signup_otps_expires",
                expireAfterSeconds=0,
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
    rate_limits.create_indexes(
        [
            IndexModel(
                [("expiresAt", ASCENDING)],
                name="rate_limits_expires",
                expireAfterSeconds=0,
            ),
        ]
    )
    ledger_entries.create_indexes(
        [
            IndexModel(
                [("orderId", ASCENDING)],
                unique=True,
                name="ledger_entries_order_unique",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="ledger_entries_tenant_created",
            ),
        ]
    )
    payouts.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="payouts_tenant_created",
            ),
        ]
    )
    _ensure_product_indexes()
    wishlists.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("userId", ASCENDING)],
                name="wishlists_tenant_user",
            ),
        ]
    )
    _ensure_tenant_indexes()


def _ensure_product_indexes() -> None:
    """Storefront queries (app/routes/product.py, home_service, category
    catalog) always match {tenantId, isActive: true} and sort by one field."""
    products.create_indexes(
        [
            # Default listing sort, new arrivals, store previews.
            IndexModel(
                [("tenantId", ASCENDING), ("isActive", ASCENDING), ("createdAt", DESCENDING)],
                name="products_tenant_active_created",
            ),
            # Price sort and minPrice/maxPrice range filter.
            IndexModel(
                [("tenantId", ASCENDING), ("isActive", ASCENDING), ("finalPrice", ASCENDING)],
                name="products_tenant_active_price",
            ),
            # Rating sort/filter and home "top rated".
            IndexModel(
                [
                    ("tenantId", ASCENDING),
                    ("isActive", ASCENDING),
                    ("averageRating", DESCENDING),
                    ("reviewCount", DESCENDING),
                ],
                name="products_tenant_active_rating",
            ),
            # Discount sort and home "best discounts" / "deal of the day".
            IndexModel(
                [
                    ("tenantId", ASCENDING),
                    ("isActive", ASCENDING),
                    ("discountPercentage", DESCENDING),
                ],
                name="products_tenant_active_discount",
            ),
            # Name sort.
            IndexModel(
                [("tenantId", ASCENDING), ("isActive", ASCENDING), ("name", ASCENDING)],
                name="products_tenant_active_name",
            ),
            # categoryIds filter and category catalog grouping.
            IndexModel(
                [("tenantId", ASCENDING), ("categoryId", ASCENDING), ("isActive", ASCENDING)],
                name="products_tenant_category",
            ),
        ]
    )


def _ensure_tenant_indexes() -> None:
    """Unique store identifiers. Deleted stores keep tenantId but drop slug and email."""
    stock_movements.create_indexes(
        [
            IndexModel(
                [("tenantId", ASCENDING), ("productId", ASCENDING), ("createdAt", DESCENDING)],
                name="stock_movements_tenant_product_created",
            ),
            IndexModel(
                [("tenantId", ASCENDING), ("createdAt", DESCENDING)],
                name="stock_movements_tenant_created",
            ),
        ]
    )
    try:
        tenants.create_indexes(
            [
                IndexModel(
                    [("tenantId", ASCENDING)],
                    unique=True,
                    name="tenants_tenant_id_unique",
                ),
                IndexModel(
                    [("slug", ASCENDING)],
                    unique=True,
                    name="tenants_slug_unique",
                    partialFilterExpression={"slug": {"$type": "string"}},
                ),
                IndexModel(
                    [("email", ASCENDING)],
                    unique=True,
                    name="tenants_email_unique",
                    partialFilterExpression={"email": {"$type": "string"}},
                ),
            ]
        )
    except OperationFailure:
        logger.exception(
            "Could not create unique tenant indexes. Existing tenants share a "
            "tenantId, slug or email; resolve the duplicates and restart."
        )
        raise
