from copy import deepcopy
from typing import Any

SECTION_BODY_MAX = 4000
SECTION_HEADING_MAX = 120


def default_about_sections(store_name: str) -> list[dict[str, str]]:
    store = str(store_name or "").strip() or "this store"
    return [
        {
            "heading": "What you can do here",
            "body": (
                "Browse our products, add your favorites to the cart, and place your order "
                "using the payment options available at checkout.\n\n"
                "Depending on the store's setup, delivery, pickup, cash on delivery, online "
                "payment, and returns may be available. Please check our Shipping & Returns "
                "pages for the latest details."
            ),
        },
        {
            "heading": "About this store",
            "body": (
                f"{store} manages its own products, pricing, orders, fulfilment, and customer "
                "support. For questions about your order, products, delivery, or returns, "
                "please contact the store directly."
            ),
        },
        {
            "heading": "Powered by Retail Cosmos",
            "body": (
                "This store is powered by Retail Cosmos, a commerce platform that provides "
                "the technology behind the storefront.\n\n"
                f"Retail Cosmos provides the platform, while {store} manages its products, "
                "customers, orders, fulfilment, and customer service."
            ),
        },
    ]


def merge_about_content(tenant: dict[str, Any] | None) -> dict[str, Any]:
    tenant = tenant or {}
    store_name = tenant.get("name") or "Store"
    defaults = default_about_sections(str(store_name))
    saved = tenant.get("aboutContent") if isinstance(tenant.get("aboutContent"), dict) else {}
    saved_sections = saved.get("sections") if isinstance(saved.get("sections"), list) else []
    sections: list[dict[str, str]] = []
    for index, default in enumerate(defaults):
        custom = saved_sections[index] if index < len(saved_sections) and isinstance(saved_sections[index], dict) else {}
        heading = str(custom.get("heading") or default["heading"]).strip()[:SECTION_HEADING_MAX]
        body = str(custom.get("body") or default["body"]).strip()[:SECTION_BODY_MAX]
        sections.append(
            {
                "heading": heading or default["heading"],
                "body": body or default["body"],
            }
        )
    return {"sections": deepcopy(sections)}
