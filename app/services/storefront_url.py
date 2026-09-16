"""Build public storefront URLs for emails, OG tags, and share links."""

from urllib.parse import urlparse

from app.config import FRONTEND_URL, TENANT_BASE_DOMAIN, TENANT_SUBDOMAIN_ROUTING


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
        return f"https://{slug}.{TENANT_BASE_DOMAIN}{path}"

    return f"{FRONTEND_URL.rstrip('/')}/{slug}{path}"


def build_storefront_url(tenant_slug: str) -> str:
    slug = (tenant_slug or "").strip().lower()
    if not slug:
        return FRONTEND_URL.rstrip("/")
    if use_tenant_subdomains():
        return f"https://{slug}.{TENANT_BASE_DOMAIN}"
    return f"{FRONTEND_URL.rstrip('/')}/{slug}"


def build_customer_storefront_url(tenant_slug: str, path: str = "/") -> str:
    """Build a public customer URL and never return a localhost address."""
    slug = (tenant_slug or "").strip().lower()
    clean_path = path if path.startswith("/") else f"/{path}"
    if slug and TENANT_SUBDOMAIN_ROUTING:
        return f"https://{slug}.{TENANT_BASE_DOMAIN}{clean_path}"

    parsed = urlparse(FRONTEND_URL)
    if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
        return ""
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    base = FRONTEND_URL.rstrip("/")
    return f"{base}/{slug}{clean_path}" if slug else f"{base}{clean_path}"


def build_default_og_image_url() -> str:
    return f"{FRONTEND_URL.rstrip('/')}/images/welcome/fashion-hero.png"
