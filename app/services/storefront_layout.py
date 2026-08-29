from copy import deepcopy
from typing import Any

DEFAULT_THEME_COLORS: dict[str, str] = {
    "primary": "#2f6b52",
    "secondary": "#4c8a6d",
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
    },
    "purple": {
        **DEFAULT_THEME_COLORS,
        "primary": "#7C3AED",
        "secondary": "#8B5CF6",
    },
    "orange": {
        **DEFAULT_THEME_COLORS,
        "primary": "#EA580C",
        "secondary": "#F97316",
        "background": "#FFFBEB",
        "border": "#FDE68A",
    },
    "dark": {
        **DEFAULT_THEME_COLORS,
        "primary": "#22C55E",
        "secondary": "#16A34A",
        "background": "#0F172A",
        "surface": "#1E293B",
        "border": "#334155",
        "textBlack": "#F8FAFC",
        "textWhite": "#0F172A",
    },
}

DEFAULT_LAYOUT_SETTINGS: dict[str, Any] = {
    "productGridColumns": 4,
    "cardStyle": "rounded",
    "sectionSpacing": "comfortable",
    "homeBannerStyle": "full",
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
}

DEFAULT_FOOTER_SECTIONS: list[dict[str, Any]] = [
    {
        "title": "Shop",
        "links": [
            {"label": "Men", "href": "#"},
            {"label": "Women", "href": "#"},
            {"label": "Kids", "href": "#"},
            {"label": "Accessories", "href": "#"},
        ],
    },
    {
        "title": "Company",
        "links": [
            {"label": "About", "href": "#"},
            {"label": "Careers", "href": "#"},
            {"label": "Contact", "href": "#"},
            {"label": "Blogs", "href": "#"},
        ],
    },
    {
        "title": "Support",
        "links": [
            {"label": "FAQs", "href": "#"},
            {"label": "Returns", "href": "#"},
            {"label": "Shipping", "href": "#"},
            {"label": "Privacy Policy", "href": "#"},
        ],
    },
]

DEFAULT_FOOTER_DESCRIPTION = (
    "Discover premium fashion, accessories and lifestyle products "
    "with secure shopping and fast delivery."
)


def _build_footer_content(tenant: dict[str, Any]) -> dict[str, Any]:
    saved = tenant.get("footerContent") or {}
    default_name = tenant.get("name") or "Store"
    sections = saved.get("sections") if saved.get("sections") else deepcopy(DEFAULT_FOOTER_SECTIONS)
    return {
        "companyName": saved.get("companyName") or default_name,
        "description": saved.get("description") or DEFAULT_FOOTER_DESCRIPTION,
        "sections": sections,
    }


def _merge_dict(base: dict[str, Any], override: dict[str, Any] | None) -> dict[str, Any]:
    merged = deepcopy(base)
    if not override:
        return merged
    for key, value in override.items():
        if value is not None:
            merged[key] = value
    return merged


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
    tenant = tenant or {}
    saved_theme = tenant.get("theme") or "green"
    saved_colors = tenant.get("themeColors") or {}
    saved_layout = tenant.get("layoutSettings") or {}
    saved_footer = tenant.get("footerContent") or {}

    theme_colors = _resolve_theme_colors(saved_theme, saved_colors)
    layout_settings = _merge_dict(DEFAULT_LAYOUT_SETTINGS, saved_layout)
    footer_content = _build_footer_content(tenant)

    has_customization = bool(
        saved_colors or saved_layout or saved_footer or tenant.get("theme")
    )

    return {
        "theme": saved_theme,
        "themeColors": theme_colors,
        "layoutSettings": layout_settings,
        "footerContent": footer_content,
        "isCustomized": has_customization,
        "source": "database" if has_customization else "default",
    }
