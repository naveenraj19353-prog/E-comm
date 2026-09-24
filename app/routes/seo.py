"""Search-engine surfaces: crawler-rendered pages, sitemaps and robots.txt.

The storefront is a client-rendered SPA. Search crawlers (Googlebot, Bingbot,
...) are routed here by the hosting layer (Netlify edge function
`product-og`, `server.cjs`, `vercel.json`) based on the User-Agent only, and
get plain server-rendered HTML with the real catalogue content. Humans always
get the SPA. Social preview bots keep using the noindex pages in `og.py`.

Stores that are inactive, deleted or suspended for billing, and inactive
products, answer 404 + noindex so they drop out of search results.
"""

from __future__ import annotations

import html
import json
import math
import re
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlencode, urlparse
from xml.sax.saxutils import escape as xml_escape

from bson import ObjectId
from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, Response

from app.config import FRONTEND_URL, ROOT_DOMAIN, TENANT_BASE_DOMAIN
from app.database.mongo import products, tenants
from app.routes.og import all_image_refs
from app.services.billing_service import is_store_operational
from app.services.checkout_service import tenant_id_query
from app.services.storefront_url import (
    build_storefront_product_url,
    build_storefront_url,
)
from app.services.tenant_service import NOT_DELETED, RESERVED_SLUGS

router = APIRouter(prefix="/seo", tags=["SEO"])

SITEMAP_URL_LIMIT = 50_000
LISTING_PAGE_SIZE = 48
HOME_PRODUCT_LIMIT = 24
MAX_CRAWLER_IMAGES = 8
MAX_SITEMAP_PAGE = 10_000

# Storefront paths that are private or per-visitor; kept out of search.
PRIVATE_STORE_PATHS = (
    "/admin",
    "/cart",
    "/checkout",
    "/orders",
    "/profile",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/wishlist",
    "/thank-you",
    "/customize",
)

PLATFORM_PAGES = (
    ("/", "weekly", "1.0"),
    ("/create-store", "monthly", "0.9"),
    ("/legal/about", "yearly", "0.4"),
    ("/legal/privacy", "yearly", "0.3"),
    ("/legal/terms", "yearly", "0.3"),
)

# Subdomains that are never stores (same list as store signup).
RESERVED_SUBDOMAINS = RESERVED_SLUGS

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")

CRAWLER_CACHE = "public, max-age=600"
SITEMAP_CACHE = "public, max-age=3600"


# ---------------------------------------------------------------------------
# Tenant resolution
# ---------------------------------------------------------------------------


def _clean_host(host: str | None) -> str:
    return str(host or "").strip().lower().split(":")[0].rstrip(".")


def tenant_slug_from_host(host: str | None) -> str | None:
    """`shop.retailcosmos.com` -> "shop"; platform / unknown hosts -> None."""
    cleaned = _clean_host(host)
    base = TENANT_BASE_DOMAIN
    if not cleaned or cleaned in {base, f"www.{base}"}:
        return None
    if not cleaned.endswith(f".{base}"):
        return None
    sub = cleaned[: -(len(base) + 1)]
    if not sub or "." in sub or sub in RESERVED_SUBDOMAINS or not _SLUG_RE.match(sub):
        return None
    return sub


def _platform_hosts() -> set[str]:
    hosts = {ROOT_DOMAIN, f"www.{ROOT_DOMAIN}", TENANT_BASE_DOMAIN, f"www.{TENANT_BASE_DOMAIN}"}
    frontend_host = _clean_host(urlparse(FRONTEND_URL).hostname)
    if frontend_host:
        hosts.add(frontend_host)
    return hosts


def platform_origin(host: str | None) -> str:
    """Origin for platform URLs. Only known hosts are echoed back."""
    cleaned = _clean_host(host)
    if cleaned and cleaned in _platform_hosts():
        return f"https://{cleaned}"
    parsed = urlparse(FRONTEND_URL)
    if parsed.scheme in {"http", "https"} and parsed.hostname not in {
        None,
        "localhost",
        "127.0.0.1",
    }:
        return FRONTEND_URL.rstrip("/")
    return f"https://{ROOT_DOMAIN}"


def _normalize_slug(slug: str | None) -> str:
    value = str(slug or "").strip().lower()
    return value if _SLUG_RE.match(value) else ""


def find_store(slug: str | None = None, tenant_id: str | None = None) -> dict | None:
    """Active, non-deleted store by slug (preferred) or tenantId."""
    clean_slug = _normalize_slug(slug)
    if clean_slug:
        return tenants.find_one({"slug": clean_slug, "isActive": True, **NOT_DELETED})
    clean_id = str(tenant_id or "").strip()
    if clean_id:
        return tenants.find_one(
            {"tenantId": tenant_id_query(clean_id), "isActive": True, **NOT_DELETED}
        )
    return None


def store_is_indexable(tenant: dict | None) -> bool:
    if not tenant or tenant.get("isActive") is False or tenant.get("deletedAt"):
        return False
    return is_store_operational(tenant)


def _tenant_id(tenant: dict) -> str:
    return str(tenant.get("tenantId") or tenant.get("slug") or "").strip()


def _tenant_slug(tenant: dict) -> str:
    return str(tenant.get("slug") or tenant.get("tenantId") or "").strip().lower()


# ---------------------------------------------------------------------------
# Public storefront URLs (subdomain or path mode, same rules as emails / OG)
# ---------------------------------------------------------------------------


def store_page_url(slug: str, path: str = "/", query: dict | None = None) -> str:
    base = build_storefront_url(slug)
    if path in ("", "/"):
        url = f"{base}/" if urlparse(base).path in ("", "/") else base
    else:
        url = f"{base}{path if path.startswith('/') else '/' + path}"
    if query:
        url = f"{url}?{urlencode(query, doseq=True)}"
    return url


def product_page_url(slug: str, product_id: str) -> str:
    return build_storefront_product_url(slug, product_id)


def category_page_url(slug: str, category_id: str, page: int = 1) -> str:
    query: dict[str, Any] = {"categoryIds": category_id}
    if page > 1:
        query["page"] = page
    return store_page_url(slug, "/products", query)


def listing_page_url(slug: str, category_ids: list[str], page: int = 1) -> str:
    query: dict[str, Any] = {}
    if category_ids:
        query["categoryIds"] = category_ids
    if page > 1:
        query["page"] = page
    return store_page_url(slug, "/products", query or None)


def store_sitemap_url(slug: str, page: int | None = None) -> str:
    base = build_storefront_url(slug).rstrip("/")
    url = f"{base}/sitemap.xml"
    return f"{url}?page={page}" if page else url


# ---------------------------------------------------------------------------
# Catalogue helpers
# ---------------------------------------------------------------------------


def _active_product_query(tenant: dict) -> dict:
    return {"tenantId": tenant_id_query(_tenant_id(tenant)), "isActive": True}


def store_categories(tenant: dict, limit: int = 500) -> list[dict[str, str]]:
    """Categories that have at least one active product, sorted by name."""
    match = {**_active_product_query(tenant), "categoryId": {"$nin": [None, ""]}}
    rows = products.aggregate(
        [
            {"$match": match},
            {"$group": {"_id": "$categoryId", "name": {"$first": "$categoryName"}}},
            {"$sort": {"name": 1, "_id": 1}},
            {"$limit": limit},
        ]
    )
    categories: list[dict[str, str]] = []
    for row in rows:
        category_id = str(row.get("_id") or "").strip()
        if not category_id:
            continue
        name = str(row.get("name") or "").strip() or category_id.replace("_", " ").title()
        categories.append({"id": category_id, "name": name})
    return categories


def _as_utc(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def _lastmod(doc: dict) -> str | None:
    moment = _as_utc(doc.get("updatedAt")) or _as_utc(doc.get("createdAt"))
    if moment is None:
        return None
    return moment.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def _price(product: dict) -> float:
    for key in ("finalPrice", "price"):
        try:
            value = product.get(key)
            if value is not None:
                return round(float(value), 2)
        except (TypeError, ValueError):
            continue
    return 0.0


def _format_inr(amount: float) -> str:
    if float(amount).is_integer():
        return f"₹{amount:,.0f}"
    return f"₹{amount:,.2f}"


def _in_stock(product: dict) -> bool:
    inventory = product.get("inventory")
    if isinstance(inventory, list) and inventory:
        total = 0
        for item in inventory:
            try:
                total += int((item or {}).get("stock") or 0)
            except (TypeError, ValueError, AttributeError):
                continue
        return total > 0
    for key in ("totalStock", "stock"):
        if key in product:
            try:
                return int(product.get(key) or 0) > 0
            except (TypeError, ValueError):
                return False
    return True


def _clean_text(value: object, limit: int | None = None) -> str:
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    if limit and len(text) > limit:
        text = text[: limit - 1].rstrip() + "…"
    return text


def _store_description(tenant: dict) -> str:
    footer = tenant.get("footerContent")
    if isinstance(footer, dict) and _clean_text(footer.get("description")):
        return _clean_text(footer.get("description"))
    about = tenant.get("aboutContent")
    if isinstance(about, dict):
        for section in about.get("sections") or []:
            if isinstance(section, dict) and _clean_text(section.get("body")):
                return _clean_text(section.get("body"))
    name = _clean_text(tenant.get("name")) or "this store"
    return f"Shop {name} online."


def _api_base(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _store_image_url(request: Request, slug: str) -> str:
    return f"{_api_base(request)}/og/store/{slug}/image"


def _product_image_urls(request: Request, slug: str, product: dict) -> list[str]:
    refs = all_image_refs(product.get("images"), limit=MAX_CRAWLER_IMAGES)
    base = f"{_api_base(request)}/og/product/{slug}/{product.get('_id')}/image"
    return [base if index == 0 else f"{base}?index={index}" for index in range(len(refs))]


# ---------------------------------------------------------------------------
# HTML rendering (every piece of store / product data is escaped)
# ---------------------------------------------------------------------------


def _e(value: object) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def json_ld_script(data: dict | list) -> str:
    """Serialize JSON-LD so no value can close the <script> element."""
    body = (
        json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )
    return f'<script type="application/ld+json">{body}</script>'


_STYLE = (
    "body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;margin:0 auto;"
    "max-width:1100px;padding:16px;color:#111;line-height:1.5}"
    "img{max-width:100%;height:auto}ul.grid{list-style:none;padding:0;display:grid;"
    "grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px}"
    "nav a,footer a{margin-right:12px}s{color:#777}"
)


def render_page(
    *,
    title: str,
    description: str,
    canonical: str,
    site_name: str,
    image: str | None,
    og_type: str,
    body: str,
    json_ld: Iterable[dict] = (),
    extra_head: str = "",
    robots: str = "index, follow",
) -> str:
    head = [
        '<meta charset="utf-8" />',
        '<meta name="viewport" content="width=device-width, initial-scale=1" />',
        f"<title>{_e(title)}</title>",
        f'<meta name="description" content="{_e(description)}" />',
        f'<meta name="robots" content="{_e(robots)}" />',
    ]
    if canonical:
        head.append(f'<link rel="canonical" href="{_e(canonical)}" />')
    head += [
        f'<meta property="og:site_name" content="{_e(site_name)}" />',
        f'<meta property="og:title" content="{_e(title)}" />',
        f'<meta property="og:description" content="{_e(description)}" />',
        f'<meta property="og:type" content="{_e(og_type)}" />',
    ]
    if canonical:
        head.append(f'<meta property="og:url" content="{_e(canonical)}" />')
    if image:
        head.append(f'<meta property="og:image" content="{_e(image)}" />')
        head.append('<meta name="twitter:card" content="summary_large_image" />')
        head.append(f'<meta name="twitter:image" content="{_e(image)}" />')
    head.append(f'<meta name="twitter:title" content="{_e(title)}" />')
    head.append(f'<meta name="twitter:description" content="{_e(description)}" />')
    if extra_head:
        head.append(extra_head)
    for item in json_ld:
        head.append(json_ld_script(item))
    head.append(f"<style>{_STYLE}</style>")
    head_html = "\n  ".join(head)
    return (
        "<!DOCTYPE html>\n"
        '<html lang="en">\n<head>\n  '
        f"{head_html}\n</head>\n<body>\n{body}\n</body>\n</html>\n"
    )


def _store_header(tenant: dict, request: Request, categories: list[dict[str, str]]) -> str:
    slug = _tenant_slug(tenant)
    name = _clean_text(tenant.get("name")) or slug
    links = [f'<a href="{_e(store_page_url(slug))}">Home</a>']
    links.append(f'<a href="{_e(store_page_url(slug, "/products"))}">All products</a>')
    for category in categories[:20]:
        links.append(
            f'<a href="{_e(category_page_url(slug, category["id"]))}">{_e(category["name"])}</a>'
        )
    logo = ""
    if tenant.get("logo"):
        logo = (
            f'<img src="{_e(_store_image_url(request, slug))}" alt="{_e(name)}" '
            'width="64" height="64" /> '
        )
    return (
        "<header>\n"
        f'<a href="{_e(store_page_url(slug))}">{logo}<strong>{_e(name)}</strong></a>\n'
        f"<nav>{' '.join(links)}</nav>\n"
        "</header>"
    )


def _store_footer(tenant: dict) -> str:
    slug = _tenant_slug(tenant)
    name = _clean_text(tenant.get("name")) or slug
    pages = (
        ("/about", "About"),
        ("/contact", "Contact"),
        ("/privacy", "Privacy policy"),
        ("/terms", "Terms"),
        ("/returns", "Returns"),
        ("/shipping", "Shipping"),
    )
    links = " ".join(
        f'<a href="{_e(store_page_url(slug, path))}">{_e(label)}</a>' for path, label in pages
    )
    return f"<footer>\n<nav>{links}</nav>\n<p>&copy; {_e(name)}</p>\n</footer>"


def _product_card(request: Request, slug: str, product: dict) -> str:
    product_id = str(product.get("_id"))
    url = product_page_url(slug, product_id)
    name = _clean_text(product.get("name")) or "Product"
    images = _product_image_urls(request, slug, product)
    image = (
        f'<a href="{_e(url)}"><img src="{_e(images[0])}" alt="{_e(name)}" '
        'loading="lazy" width="320" height="320" /></a>'
        if images
        else ""
    )
    return (
        f"<li>{image}"
        f'<h3><a href="{_e(url)}">{_e(name)}</a></h3>'
        f"<p>{_e(_format_inr(_price(product)))}</p></li>"
    )


def _business_schema_type(tenant: dict) -> str:
    business_type = str(tenant.get("businessType") or "retail").lower()
    return {"menu": "Restaurant", "service": "LocalBusiness"}.get(business_type, "Store")


def render_store_home(request: Request, tenant: dict) -> str:
    slug = _tenant_slug(tenant)
    name = _clean_text(tenant.get("name")) or slug
    description = _store_description(tenant)
    canonical = store_page_url(slug)
    image = _store_image_url(request, slug)
    categories = store_categories(tenant)
    latest = list(
        products.find(_active_product_query(tenant))
        .sort([("createdAt", -1), ("_id", -1)])
        .limit(HOME_PRODUCT_LIMIT)
    )

    category_items = "".join(
        f'<li><a href="{_e(category_page_url(slug, c["id"]))}">{_e(c["name"])}</a></li>'
        for c in categories
    )
    product_items = "".join(_product_card(request, slug, p) for p in latest)
    sections = [f"<h1>{_e(name)}</h1>", f"<p>{_e(description)}</p>"]
    if category_items:
        sections.append(f"<section>\n<h2>Shop by category</h2>\n<ul>{category_items}</ul>\n</section>")
    if product_items:
        sections.append(
            "<section>\n<h2>Latest products</h2>\n"
            f'<ul class="grid">{product_items}</ul>\n'
            f'<p><a href="{_e(store_page_url(slug, "/products"))}">View all products</a></p>\n'
            "</section>"
        )
    body = "\n".join(
        [_store_header(tenant, request, categories), "<main>", *sections, "</main>", _store_footer(tenant)]
    )

    store_ld: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": _business_schema_type(tenant),
        "@id": f"{canonical}#store",
        "name": name,
        "url": canonical,
        "description": description,
        "image": image,
    }
    if tenant.get("logo"):
        store_ld["logo"] = image
    website_ld = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": name,
        "url": canonical,
        "potentialAction": {
            "@type": "SearchAction",
            "target": {
                "@type": "EntryPoint",
                "urlTemplate": f"{store_page_url(slug, '/products')}?search={{search_term_string}}",
            },
            "query-input": "required name=search_term_string",
        },
    }
    return render_page(
        title=name,
        description=_clean_text(description, 300),
        canonical=canonical,
        site_name=name,
        image=image,
        og_type="website",
        body=body,
        json_ld=[store_ld, website_ld],
    )


def _clean_category_ids(values: list[str] | None) -> list[str]:
    cleaned: list[str] = []
    for value in values or []:
        item = str(value or "").strip()
        if item and len(item) <= 120 and item not in cleaned:
            cleaned.append(item)
    return sorted(cleaned)[:10]


def render_product_listing(
    request: Request,
    tenant: dict,
    category_ids: list[str],
    page: int,
) -> str | None:
    """Listing / category page. None when the page has nothing to show (404)."""
    slug = _tenant_slug(tenant)
    store_name = _clean_text(tenant.get("name")) or slug
    categories = store_categories(tenant)
    query = _active_product_query(tenant)
    if category_ids:
        query["categoryId"] = {"$in": category_ids}
    total = int(products.count_documents(query))
    pages = max(1, math.ceil(total / LISTING_PAGE_SIZE))
    if (category_ids and total == 0) or page > pages:
        return None
    items = list(
        products.find(query)
        .sort([("createdAt", -1), ("_id", -1)])
        .skip((page - 1) * LISTING_PAGE_SIZE)
        .limit(LISTING_PAGE_SIZE)
    )

    names = {c["id"]: c["name"] for c in categories}
    if category_ids:
        heading = ", ".join(names.get(cid, cid) for cid in category_ids)
    else:
        heading = "All products"
    title = f"{heading} | {store_name}"
    if page > 1:
        title = f"{heading} (page {page}) | {store_name}"
    description = _clean_text(
        f"Shop {heading.lower() if not category_ids else heading} at {store_name}. "
        f"{total} product{'s' if total != 1 else ''} available.",
        300,
    )
    canonical = listing_page_url(slug, category_ids, page)

    links: list[str] = []
    if page > 1:
        links.append(f'<link rel="prev" href="{_e(listing_page_url(slug, category_ids, page - 1))}" />')
    if page < pages:
        links.append(f'<link rel="next" href="{_e(listing_page_url(slug, category_ids, page + 1))}" />')

    pager: list[str] = []
    if page > 1:
        pager.append(f'<a href="{_e(listing_page_url(slug, category_ids, page - 1))}">Previous page</a>')
    if page < pages:
        pager.append(f'<a href="{_e(listing_page_url(slug, category_ids, page + 1))}">Next page</a>')

    product_items = "".join(_product_card(request, slug, p) for p in items)
    body_parts = [
        _store_header(tenant, request, categories),
        "<main>",
        f"<h1>{_e(heading)}</h1>",
        f"<p>{_e(description)}</p>",
        f'<ul class="grid">{product_items}</ul>' if product_items else "<p>No products yet.</p>",
    ]
    if pager:
        body_parts.append(f"<nav>{' '.join(pager)}</nav>")
    body_parts += ["</main>", _store_footer(tenant)]

    item_list = {
        "@context": "https://schema.org",
        "@type": "ItemList",
        "name": heading,
        "url": canonical,
        "numberOfItems": total,
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": (page - 1) * LISTING_PAGE_SIZE + index + 1,
                "url": product_page_url(slug, str(p.get("_id"))),
                "name": _clean_text(p.get("name")) or "Product",
            }
            for index, p in enumerate(items)
        ],
    }
    return render_page(
        title=title,
        description=description,
        canonical=canonical,
        site_name=store_name,
        image=_store_image_url(request, slug),
        og_type="website",
        body="\n".join(body_parts),
        json_ld=[item_list],
        extra_head="\n  ".join(links),
    )


def _description_paragraphs(text: object) -> str:
    raw = str(text or "").strip()
    if not raw:
        return ""
    blocks = [block.strip() for block in re.split(r"\n\s*\n|\r\n\s*\r\n", raw) if block.strip()]
    return "".join(
        "<p>" + "<br />".join(_e(line.strip()) for line in block.splitlines() if line.strip()) + "</p>"
        for block in blocks[:30]
    )


def _variant_values(product: dict, key: str) -> list[str]:
    values: list[str] = []
    for item in product.get("inventory") or []:
        if not isinstance(item, dict):
            continue
        value = _clean_text(item.get(key), 60)
        if value and value.lower() not in {"default", "na", "n/a"} and value not in values:
            values.append(value)
    return values[:30]


def render_product_detail(request: Request, tenant: dict, product: dict) -> str:
    slug = _tenant_slug(tenant)
    store_name = _clean_text(tenant.get("name")) or slug
    product_id = str(product.get("_id"))
    name = _clean_text(product.get("name")) or "Product"
    brand = _clean_text(product.get("brand"), 120)
    category_id = str(product.get("categoryId") or "").strip()
    category_name = _clean_text(product.get("categoryName")) or category_id.replace("_", " ").title()
    price = _price(product)
    try:
        list_price = round(float(product.get("price") or 0), 2)
    except (TypeError, ValueError):
        list_price = 0.0
    in_stock = _in_stock(product)
    canonical = product_page_url(slug, product_id)
    images = _product_image_urls(request, slug, product)
    image = images[0] if images else _store_image_url(request, slug)
    meta_description = _clean_text(product.get("description"), 300) or _clean_text(
        f"Buy {name} at {store_name} for {_format_inr(price)}."
    )

    price_html = f"<strong>{_e(_format_inr(price))}</strong>"
    if list_price > price:
        price_html += f" <s>{_e(_format_inr(list_price))}</s>"
    lazy = ' loading="lazy"'
    gallery = "".join(
        f'<img src="{_e(url)}" alt="{_e(name)}" width="600" height="600"{lazy if index else ""} />'
        for index, url in enumerate(images)
    )
    facts: list[str] = []
    if brand:
        facts.append(f"<li>Brand: {_e(brand)}</li>")
    if category_id:
        facts.append(
            f'<li>Category: <a href="{_e(category_page_url(slug, category_id))}">{_e(category_name)}</a></li>'
        )
    colors = _variant_values(product, "color")
    sizes = _variant_values(product, "size")
    if colors:
        facts.append(f"<li>Colours: {_e(', '.join(colors))}</li>")
    if sizes:
        facts.append(f"<li>Sizes: {_e(', '.join(sizes))}</li>")
    facts.append(f"<li>Availability: {'In stock' if in_stock else 'Out of stock'}</li>")

    categories = store_categories(tenant)
    body = "\n".join(
        [
            _store_header(tenant, request, categories),
            "<main>",
            "<article>",
            f"<h1>{_e(name)}</h1>",
            f"<p>{price_html}</p>",
            f"<div>{gallery}</div>" if gallery else "",
            _description_paragraphs(product.get("description")),
            f"<ul>{''.join(facts)}</ul>",
            "</article>",
            f'<p><a href="{_e(store_page_url(slug, "/products"))}">More products from {_e(store_name)}</a></p>',
            "</main>",
            _store_footer(tenant),
        ]
    )

    product_ld: dict[str, Any] = {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": f"{canonical}#product",
        "name": name,
        "url": canonical,
        "productID": product_id,
        "description": _clean_text(product.get("description"), 5000) or meta_description,
        "offers": {
            "@type": "Offer",
            "url": canonical,
            "price": f"{price:.2f}",
            "priceCurrency": "INR",
            "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock",
            "itemCondition": "https://schema.org/NewCondition",
            "seller": {"@type": "Organization", "name": store_name, "url": store_page_url(slug)},
        },
    }
    if images:
        product_ld["image"] = images
    if brand:
        product_ld["brand"] = {"@type": "Brand", "name": brand}
    if category_name:
        product_ld["category"] = category_name
    try:
        review_count = int(product.get("reviewCount") or 0)
        rating = float(product.get("averageRating") or 0)
    except (TypeError, ValueError):
        review_count, rating = 0, 0.0
    if review_count > 0 and rating > 0:
        product_ld["aggregateRating"] = {
            "@type": "AggregateRating",
            "ratingValue": round(rating, 1),
            "reviewCount": review_count,
        }
    crumbs = [("Home", store_page_url(slug))]
    if category_id:
        crumbs.append((category_name, category_page_url(slug, category_id)))
    crumbs.append((name, canonical))
    breadcrumb_ld = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": index + 1, "name": label, "item": url}
            for index, (label, url) in enumerate(crumbs)
        ],
    }
    extra = "\n  ".join(
        [
            f'<meta property="product:price:amount" content="{price:.2f}" />',
            '<meta property="product:price:currency" content="INR" />',
            f'<meta property="product:availability" content="{"in stock" if in_stock else "out of stock"}" />',
        ]
    )
    return render_page(
        title=f"{name} | {store_name}",
        description=meta_description,
        canonical=canonical,
        site_name=store_name,
        image=image,
        og_type="product",
        body=body,
        json_ld=[product_ld, breadcrumb_ld],
        extra_head=extra,
    )


def render_not_found(message: str) -> str:
    return render_page(
        title=message,
        description=message,
        canonical="",
        site_name="Retail Cosmos",
        image=None,
        og_type="website",
        body=f"<main><h1>{_e(message)}</h1></main>",
        robots="noindex, nofollow",
    )


def _html(content: str) -> HTMLResponse:
    return HTMLResponse(
        content=content,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": CRAWLER_CACHE},
    )


def _not_found(message: str) -> HTMLResponse:
    return HTMLResponse(
        content=render_not_found(message),
        status_code=404,
        media_type="text/html; charset=utf-8",
        headers={"Cache-Control": "public, max-age=300", "X-Robots-Tag": "noindex"},
    )


STORE_NOT_FOUND_TEXT = "Store not found"
PRODUCT_NOT_FOUND_TEXT = "Product not found"
PAGE_NOT_FOUND_TEXT = "Page not found"


def _indexable_store(slug: str) -> dict | None:
    tenant = find_store(slug=slug)
    return tenant if store_is_indexable(tenant) else None


# ---------------------------------------------------------------------------
# Crawler page routes
# ---------------------------------------------------------------------------


@router.get("/render/{slug}", response_class=HTMLResponse)
def crawler_store_home(slug: str, request: Request):
    """Store home for search crawlers (the edge layer routes them here by UA)."""
    tenant = _indexable_store(slug)
    if not tenant:
        return _not_found(STORE_NOT_FOUND_TEXT)
    return _html(render_store_home(request, tenant))


@router.get("/render/{slug}/products", response_class=HTMLResponse)
def crawler_product_listing(
    slug: str,
    request: Request,
    categoryIds: list[str] | None = Query(default=None),
    category: str | None = None,
    page: int = Query(default=1, ge=1, le=MAX_SITEMAP_PAGE),
):
    """Product listing / category page for search crawlers."""
    tenant = _indexable_store(slug)
    if not tenant:
        return _not_found(STORE_NOT_FOUND_TEXT)
    ids = _clean_category_ids([*(categoryIds or []), *([category] if category else [])])
    content = render_product_listing(request, tenant, ids, page)
    if content is None:
        return _not_found(PAGE_NOT_FOUND_TEXT)
    return _html(content)


@router.get("/render/{slug}/product/{product_id}", response_class=HTMLResponse)
def crawler_product_detail(slug: str, product_id: str, request: Request):
    """Product detail page for search crawlers."""
    tenant = _indexable_store(slug)
    if not tenant:
        return _not_found(STORE_NOT_FOUND_TEXT)
    if not ObjectId.is_valid(product_id):
        return _not_found(PRODUCT_NOT_FOUND_TEXT)
    product = products.find_one(
        {"_id": ObjectId(product_id), **_active_product_query(tenant)}
    )
    if not product:
        return _not_found(PRODUCT_NOT_FOUND_TEXT)
    return _html(render_product_detail(request, tenant, product))


# ---------------------------------------------------------------------------
# Sitemaps
# ---------------------------------------------------------------------------


def _urlset(entries: Iterable[tuple[str, str | None]]) -> str:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            lines.append(f"    <lastmod>{xml_escape(lastmod)}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    return "\n".join(lines) + "\n"


def _sitemap_index(locations: Iterable[str]) -> str:
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc in locations:
        lines.append(f"  <sitemap><loc>{xml_escape(loc)}</loc></sitemap>")
    lines.append("</sitemapindex>")
    return "\n".join(lines) + "\n"


def _store_head_entries(tenant: dict) -> list[tuple[str, str | None]]:
    slug = _tenant_slug(tenant)
    entries: list[tuple[str, str | None]] = [
        (store_page_url(slug), _lastmod(tenant)),
        (store_page_url(slug, "/products"), None),
        (store_page_url(slug, "/about"), None),
        (store_page_url(slug, "/contact"), None),
    ]
    for category in store_categories(tenant, limit=5000):
        entries.append((category_page_url(slug, category["id"]), None))
    return entries


def _product_entries(tenant: dict, skip: int, limit: int) -> list[tuple[str, str | None]]:
    if limit <= 0:
        return []
    slug = _tenant_slug(tenant)
    cursor = (
        products.find(
            _active_product_query(tenant),
            {"_id": 1, "updatedAt": 1, "createdAt": 1},
        )
        .sort("_id", 1)
        .skip(max(0, skip))
        .limit(limit)
    )
    return [(product_page_url(slug, str(doc.get("_id"))), _lastmod(doc)) for doc in cursor]


def build_store_sitemap(
    tenant: dict,
    page: int | None = None,
    per_file: int = SITEMAP_URL_LIMIT,
) -> str | None:
    """A store's urlset, or a sitemap index when it has more than `per_file` URLs.

    Returns None for a page number that does not exist.
    """
    slug = _tenant_slug(tenant)
    head = _store_head_entries(tenant)
    product_count = int(products.count_documents(_active_product_query(tenant)))
    total = len(head) + product_count
    pages = max(1, math.ceil(total / per_file))

    if page is None and pages > 1:
        return _sitemap_index(store_sitemap_url(slug, number) for number in range(1, pages + 1))
    page = page or 1
    if page > pages:
        return None

    offset = (page - 1) * per_file
    entries = head[offset : offset + per_file]
    product_skip = max(0, offset - len(head))
    entries += _product_entries(tenant, product_skip, per_file - len(entries))
    return _urlset(entries)


def build_platform_sitemap(origin: str) -> str:
    base = origin.rstrip("/")
    return _urlset((f"{base}{path}" if path != "/" else f"{base}/", None) for path, _freq, _prio in PLATFORM_PAGES)


def build_platform_sitemap_index(origin: str) -> str:
    """Platform pages plus every live store's sitemap."""
    locations = [f"{origin.rstrip('/')}/sitemap-platform.xml"]
    cursor = tenants.find(
        {"isActive": True, **NOT_DELETED},
        {"_id": 1, "slug": 1, "tenantId": 1, "isActive": 1, "billing": 1},
    ).sort("slug", 1)
    for tenant in cursor:
        if len(locations) >= SITEMAP_URL_LIMIT:
            break
        slug = _normalize_slug(tenant.get("slug"))
        if slug and store_is_indexable(tenant):
            locations.append(store_sitemap_url(slug))
    return _sitemap_index(locations)


def _xml(content: str, status_code: int = 200) -> Response:
    return Response(
        content=content,
        status_code=status_code,
        media_type="application/xml; charset=utf-8",
        headers={"Cache-Control": SITEMAP_CACHE if status_code == 200 else "public, max-age=300"},
    )


_EMPTY_URLSET = _urlset([])


@router.get("/sitemap.xml")
def sitemap(
    host: str | None = None,
    slug: str | None = None,
    tenantId: str | None = None,
    page: int | None = Query(default=None, ge=1, le=MAX_SITEMAP_PAGE),
):
    """
    Store sitemap for `slug` / `tenantId` / a store host (`host=shop.retailcosmos.com`).
    Without a store (platform host or no parameters) this is the platform
    sitemap index: platform pages plus every live store's sitemap.
    """
    store_slug = _normalize_slug(slug) or tenant_slug_from_host(host)
    if store_slug or tenantId:
        tenant = find_store(slug=store_slug, tenant_id=None if store_slug else tenantId)
        if not store_is_indexable(tenant):
            return _xml(_EMPTY_URLSET, status_code=404)
        content = build_store_sitemap(tenant, page)
        if content is None:
            return _xml(_EMPTY_URLSET, status_code=404)
        return _xml(content)
    return _xml(build_platform_sitemap_index(platform_origin(host)))


@router.get("/sitemap-platform.xml")
def platform_sitemap(host: str | None = None):
    """Marketing site pages: /, /create-store, /legal/*."""
    return _xml(build_platform_sitemap(platform_origin(host)))


# ---------------------------------------------------------------------------
# robots.txt
# ---------------------------------------------------------------------------


def build_store_robots(sitemap_url: str | None) -> str:
    lines = ["User-agent: *", "Allow: /"]
    lines += [f"Disallow: {path}" for path in PRIVATE_STORE_PATHS]
    if sitemap_url:
        lines += ["", f"Sitemap: {sitemap_url}"]
    return "\n".join(lines) + "\n"


def build_platform_robots(origin: str) -> str:
    lines = ["User-agent: *", "Allow: /", "Disallow: /admin", "Disallow: /welcome-alt"]
    # Path-mode storefronts live at /{slug}/...
    lines += [f"Disallow: /*{path}" for path in PRIVATE_STORE_PATHS if path != "/admin"]
    lines += ["", f"Sitemap: {origin.rstrip('/')}/sitemap.xml"]
    return "\n".join(lines) + "\n"


@router.get("/robots.txt")
def robots_txt(host: str | None = None, slug: str | None = None):
    """robots.txt for a store host (`host=shop.retailcosmos.com`) or the platform."""
    store_slug = tenant_slug_from_host(host) or _normalize_slug(slug)
    if store_slug:
        tenant = find_store(slug=store_slug)
        sitemap_url = store_sitemap_url(store_slug) if store_is_indexable(tenant) else None
        content = build_store_robots(sitemap_url)
    else:
        content = build_platform_robots(platform_origin(host))
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": SITEMAP_CACHE},
    )
