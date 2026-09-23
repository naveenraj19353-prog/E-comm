from copy import deepcopy
from typing import Any

FOOTER_HREF_BY_LABEL: dict[str, str] = {
    "about": "/about",
    "contact": "/contact",
    "privacy": "/privacy",
    "privacy policy": "/privacy",
    "terms": "/terms",
    "terms of service": "/terms",
    "terms & conditions": "/terms",
    "returns": "/returns",
    "shipping": "/shipping",
    "faqs": "/returns",
    "shop all": "/products",
    "all products": "/products",
    "products": "/products",
    "men": "/products",
    "women": "/products",
    "kids": "/products",
    "accessories": "/products",
    "wishlist": "/wishlist",
    "cart": "/cart",
    "my orders": "/orders",
    "orders": "/orders",
}


def resolve_footer_href(label: str, href: str | None) -> str:
    current = str(href or "").strip()
    if current and current != "#":
        return current
    mapped = FOOTER_HREF_BY_LABEL.get(str(label or "").strip().lower())
    return mapped or ""


def normalize_footer_sections(sections: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for section in sections or []:
        links = []
        for link in section.get("links") or []:
            if not isinstance(link, dict):
                continue
            href = resolve_footer_href(str(link.get("label") or ""), link.get("href"))
            if not href:
                continue
            links.append(
                {
                    "label": str(link.get("label") or "Link"),
                    "href": href,
                }
            )
        if links:
            normalized.append(
                {
                    "title": str(section.get("title") or "Section"),
                    "links": links,
                }
            )
    return normalized
