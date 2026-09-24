from copy import deepcopy
from typing import Any

from app.services.about_content import merge_about_content
from app.services.cache import cached_storefront
from app.services.footer_links import normalize_footer_sections

DEFAULT_THEME_COLORS: dict[str, str] = {
    "primary": "#2f6b52",
    "secondary": "#4c8a6d",
    "headerBackground": "#F1F6F3",
    "background": "#F9FAFB",
    "surface": "#FFFFFF",
    "border": "#E5E7EB",
    "textBlack": "#111827",
    "textWhite": "#FFFFFF",
    "success": "#10B981",
    "warning": "#F59E0B",
    "danger": "#DC2626",
}

THEME_PRESET_COLORS: dict[str, dict[str, str]] = {
    "green": DEFAULT_THEME_COLORS,
    "blue": {
        **DEFAULT_THEME_COLORS,
        "primary": "#2563EB",
        "secondary": "#3B82F6",
        "headerBackground": "#EFF6FF",
    },
    "purple": {
        **DEFAULT_THEME_COLORS,
        "primary": "#7C3AED",
        "secondary": "#8B5CF6",
        "headerBackground": "#F5F3FF",
    },
    "orange": {
        **DEFAULT_THEME_COLORS,
        "primary": "#EA580C",
        "secondary": "#F97316",
        "headerBackground": "#FFF7ED",
        "background": "#FFFBEB",
        "border": "#FDE68A",
    },
    "dark": {
        **DEFAULT_THEME_COLORS,
        "primary": "#22C55E",
        "secondary": "#16A34A",
        "headerBackground": "#172033",
        "background": "#0F172A",
        "surface": "#1E293B",
        "border": "#334155",
        "textBlack": "#F8FAFC",
        "textWhite": "#0F172A",
    },
}

HOME_SECTION_IDS: list[str] = [
    "banner",
    "festival",
    "categories",
    "trending",
    "discounts",
    "mostSelling",
    "newArrivals",
    "topRated",
    "dealOfTheDay",
    "testimonials",
]

DEFAULT_LAYOUT_SETTINGS: dict[str, Any] = {
    "productGridColumns": 4,
    "cardStyle": "rounded",
    "sectionSpacing": "comfortable",
    "homeBannerStyle": "full",
    "homeSectionOrder": list(HOME_SECTION_IDS),
    "showHomeBanner": True,
    "showDealOfTheDay": True,
    "showTestimonials": True,
    "showCategorySlider": True,
    "showProductRating": True,
    "showQuickAddOnCard": True,
    "showDiscountBadge": True,
    "showHeaderSearch": True,
    "showHeaderCategories": True,
    "headerLogoPosition": "left",
    "headerSearchPosition": "right",
    "headerNavAlignment": "left",
    "wishlistIconPosition": "right",
    "stickyHeader": True,
    "footerLayout": "full",
    "showFooterSocial": True,
    "showFooterLinks": True,
    "productCardImageRatio": "portrait",
    "pageWidth": "standard",
    "productListingLayout": "sidebar-left",
    "productViewMode": "grid",
    "productDetailLayout": "gallery-left",
    "cartLayout": "split",
    "productCardDesign": "classic",
}

DEFAULT_FOOTER_SECTIONS: list[dict[str, Any]] = [
    {
        "title": "Shop",
        "links": [
            {"label": "Shop all", "href": "/products"},
            {"label": "Wishlist", "href": "/wishlist"},
            {"label": "Cart", "href": "/cart"},
            {"label": "My orders", "href": "/orders"},
        ],
    },
    {
        "title": "Company",
        "links": [
            {"label": "About", "href": "/about"},
            {"label": "Contact", "href": "/contact"},
        ],
    },
    {
        "title": "Support",
        "links": [
            {"label": "Returns", "href": "/returns"},
            {"label": "Shipping", "href": "/shipping"},
            {"label": "Privacy Policy", "href": "/privacy"},
            {"label": "Terms", "href": "/terms"},
        ],
    },
]

DEFAULT_FOOTER_DESCRIPTION = (
    "Shop this store with secure checkout. Delivery and returns follow the "
    "policies published on this site."
)

# Default footer per business type. Keep in sync with client/src/theme/footerDefaults.ts.
_COMPANY_SECTION: dict[str, Any] = {
    "title": "Company",
    "links": [
        {"label": "About", "href": "/about"},
        {"label": "Contact", "href": "/contact"},
    ],
}
_PRIVACY_ONLY_SUPPORT: dict[str, Any] = {
    "title": "Support",
    "links": [{"label": "Privacy Policy", "href": "/privacy"}],
}

DEFAULT_FOOTER_SECTIONS_BY_BUSINESS: dict[str, list[dict[str, Any]]] = {
    "retail": DEFAULT_FOOTER_SECTIONS,
    "service": [
        {
            "title": "Services",
            "links": [
                {"label": "All services", "href": "/products"},
                {"label": "Saved", "href": "/wishlist"},
                {"label": "My list", "href": "/cart"},
            ],
        },
        _COMPANY_SECTION,
        _PRIVACY_ONLY_SUPPORT,
    ],
    "menu": [
        {
            "title": "Menu",
            "links": [
                {"label": "Full menu", "href": "/products"},
                {"label": "My order", "href": "/cart"},
                {"label": "Order history", "href": "/orders"},
            ],
        },
        _COMPANY_SECTION,
        _PRIVACY_ONLY_SUPPORT,
    ],
}

DEFAULT_FOOTER_DESCRIPTION_BY_BUSINESS: dict[str, str] = {
    "retail": DEFAULT_FOOTER_DESCRIPTION,
    "service": (
        "Browse our services and save the ones you like. "
        "Contact us to book or ask a question."
    ),
    "menu": "Browse the menu, order from your table and pay at the counter.",
}


def _business_type(tenant: dict[str, Any]) -> str:
    value = str(tenant.get("businessType") or "").strip().lower()
    return value if value in DEFAULT_FOOTER_SECTIONS_BY_BUSINESS else "retail"


def _build_footer_content(tenant: dict[str, Any]) -> dict[str, Any]:
    saved = tenant.get("footerContent") or {}
    default_name = tenant.get("name") or "Store"
    business_type = _business_type(tenant)
    sections = (
        saved.get("sections")
        if saved.get("sections")
        else deepcopy(DEFAULT_FOOTER_SECTIONS_BY_BUSINESS[business_type])
    )
    return {
        "companyName": saved.get("companyName") or default_name,
        "description": saved.get("description")
        or DEFAULT_FOOTER_DESCRIPTION_BY_BUSINESS[business_type],
        "sections": normalize_footer_sections(sections),
    }


def _merge_dict(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    merged = deepcopy(base)
    if not override:
        return merged
    for key, value in override.items():
        if value is not None:
            merged[key] = value
    return merged


def normalize_home_section_order(order: object) -> list[str]:
    allowed = set(HOME_SECTION_IDS)
    next_order: list[str] = []
    seen: set[str] = set()
    if isinstance(order, list):
        for item in order:
            key = str(item or "").strip()
            if key not in allowed or key in seen:
                continue
            seen.add(key)
            next_order.append(key)
    for item in HOME_SECTION_IDS:
        if item not in seen:
            next_order.append(item)
    return next_order


def _pick_color_overrides(
    saved_colors: dict[str, Any],
    baseline: dict[str, str] | None = None,
) -> dict[str, str]:
    baseline = baseline or DEFAULT_THEME_COLORS
    overrides: dict[str, str] = {}
    for key, value in saved_colors.items():
        if value is not None and baseline.get(key) != value:
            overrides[key] = value
    return overrides


def _resolve_theme_colors(saved_theme: str, saved_colors: dict[str, Any] | None) -> dict[str, str]:
    preset = THEME_PRESET_COLORS.get(saved_theme, DEFAULT_THEME_COLORS)
    if not saved_colors:
        return deepcopy(preset)
    overrides = _pick_color_overrides(saved_colors)
    return _merge_dict(preset, overrides)


def build_storefront_layout(tenant: dict[str, Any] | None) -> dict[str, Any]:
    """Storefront layout for a tenant document, cached per tenant.

    The cache key includes the tenant's ``updatedAt`` so a saved theme/layout
    shows up at once even on server processes that did not handle the write;
    tenant writes also invalidate this process's entries explicitly.
    """
    tenant = tenant or {}
    tenant_id = str(tenant.get("tenantId") or "").strip()
    if not tenant_id:
        return _build_storefront_layout(tenant)
    updated_at = tenant.get("updatedAt")
    version = (
        updated_at.isoformat()
        if hasattr(updated_at, "isoformat")
        else str(updated_at or "")
    )
    layout = cached_storefront(
        tenant_id,
        "layout",
        (version,),
        lambda: _build_storefront_layout(tenant),
    )
    # Callers may add or change fields; never hand out the shared copy.
    return deepcopy(layout)


def _build_storefront_layout(tenant: dict[str, Any]) -> dict[str, Any]:
    saved_theme = tenant.get("theme") or "green"
    saved_colors = tenant.get("themeColors") or {}
    saved_layout = tenant.get("layoutSettings") or {}
    saved_footer = tenant.get("footerContent") or {}
    saved_about = tenant.get("aboutContent") or {}

    theme_colors = _resolve_theme_colors(saved_theme, saved_colors)
    layout_settings = _merge_dict(DEFAULT_LAYOUT_SETTINGS, saved_layout)
    layout_settings["homeSectionOrder"] = normalize_home_section_order(
        layout_settings.get("homeSectionOrder")
    )
    footer_content = _build_footer_content(tenant)
    about_content = merge_about_content(tenant)

    has_customization = bool(
        saved_colors or saved_layout or saved_footer or saved_about or tenant.get("theme")
    )

    return {
        "theme": saved_theme,
        "themeColors": theme_colors,
        "layoutSettings": layout_settings,
        "footerContent": footer_content,
        "aboutContent": about_content,
        "isCustomized": has_customization,
        "source": "database" if has_customization else "default",
    }
