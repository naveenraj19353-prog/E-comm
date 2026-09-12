"""Build public storefront URLs for emails, OG tags, and share links."""

from app.config import FRONTEND_URL, ROOT_DOMAIN, TENANT_SUBDOMAIN_ROUTING


def use_tenant_subdomains() -> bool:
    if not TENANT_SUBDOMAIN_ROUTING:
        return False
    host = FRONTEND_URL.lower()
    if (
        "localhost" in host
        or "127.0.0.1" in host
        or "netlify.app" in host
        or "vercel.app" in host
        or "amplifyapp.com" in host
    ):
        return False
    return True


def build_storefront_product_url(tenant_slug: str, product_id: str) -> str:
    slug = (tenant_slug or "").strip().lower()
    product_id = (product_id or "").strip()
    path = f"/product-details/{product_id}"
    if not slug:
        return f"{FRONTEND_URL.rstrip('/')}{path}"

    if use_tenant_subdomains():
        return f"https://{slug}.{ROOT_DOMAIN}{path}"

    return f"{FRONTEND_URL.rstrip('/')}/{slug}{path}"


def build_default_og_image_url() -> str:
    return f"{FRONTEND_URL.rstrip('/')}/images/welcome/fashion-hero.png"
