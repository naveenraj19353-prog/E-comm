from html import escape

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Response

from app.config import FRONTEND_URL
from app.database.mongo import products, tenants

router = APIRouter(
    prefix="/share",
    tags=["Share"],
)

DEFAULT_OG_IMAGE = f"{FRONTEND_URL.rstrip('/')}/images/product-placeholder.svg"


def _first_product_image(images: object) -> str:
    if not isinstance(images, dict):
        return ""
    for urls in images.values():
        if not isinstance(urls, list):
            continue
        for url in urls:
            if isinstance(url, str) and url.strip():
                return url.strip()
    return ""


def _format_price(product: dict) -> str | None:
    for key in ("finalPrice", "price"):
        value = product.get(key)
        if value is None:
            continue
        try:
            amount = float(value)
        except (TypeError, ValueError):
            continue
        if amount >= 0:
            return f"₹{amount:,.2f}".replace(".00", "")
    return None


def _build_share_html(
    *,
    title: str,
    description: str,
    image_url: str,
    share_url: str,
    product_url: str,
) -> str:
    safe_title = escape(title)
    safe_description = escape(description)
    safe_image = escape(image_url, quote=True)
    safe_share_url = escape(share_url, quote=True)
    safe_product_url = escape(product_url, quote=True)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{safe_title}</title>
  <meta name="description" content="{safe_description}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="OmniStore" />
  <meta property="og:title" content="{safe_title}" />
  <meta property="og:description" content="{safe_description}" />
  <meta property="og:image" content="{safe_image}" />
  <meta property="og:url" content="{safe_share_url}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{safe_title}" />
  <meta name="twitter:description" content="{safe_description}" />
  <meta name="twitter:image" content="{safe_image}" />
  <meta http-equiv="refresh" content="0;url={safe_product_url}" />
</head>
<body>
  <p><a href="{safe_product_url}">{safe_title}</a></p>
</body>
</html>"""


@router.get("/{tenant_slug}/product/{product_id}")
def product_share_preview(
    tenant_slug: str,
    product_id: str,
):
    slug = tenant_slug.strip().lower()
    tenant = tenants.find_one({"slug": slug})
    if not tenant or tenant.get("isActive") is False:
        raise HTTPException(status_code=404, detail="Store not found.")

    if not ObjectId.is_valid(product_id):
        raise HTTPException(status_code=400, detail="Invalid product ID.")

    tenant_id = tenant.get("tenantId")
    product = products.find_one(
        {
            "_id": ObjectId(product_id),
            "tenantId": tenant_id,
            "isActive": True,
        }
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found.")

    name = str(product.get("name") or "Product").strip()
    price_text = _format_price(product)
    tenant_name = str(tenant.get("name") or slug).strip()
    description = product.get("description")
    if isinstance(description, str) and description.strip():
        og_description = description.strip()[:200]
    elif price_text:
        og_description = f"{price_text} at {tenant_name}"
    else:
        og_description = f"Shop {name} at {tenant_name}"

    image_url = _first_product_image(product.get("images")) or DEFAULT_OG_IMAGE
    frontend = FRONTEND_URL.rstrip("/")
    product_url = f"{frontend}/{slug}/product-details/{product_id}"
    share_url = f"{frontend}/share/{slug}/product/{product_id}"

    html = _build_share_html(
        title=name,
        description=og_description,
        image_url=image_url,
        share_url=share_url,
        product_url=product_url,
    )
    return Response(content=html, media_type="text/html; charset=utf-8")
