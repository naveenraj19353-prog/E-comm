DISPLAY_CURRENCIES = (
    ("INR", "Indian Rupee", 1.0),
    ("USD", "US Dollar", 83.0),
    ("EUR", "Euro", 90.0),
    ("GBP", "British Pound", 105.0),
    ("AED", "UAE Dirham", 22.6),
    ("SAR", "Saudi Riyal", 22.1),
    ("QAR", "Qatari Riyal", 22.8),
    ("KWD", "Kuwaiti Dinar", 270.0),
    ("BHD", "Bahraini Dinar", 220.0),
    ("OMR", "Omani Rial", 215.0),
    ("SGD", "Singapore Dollar", 62.0),
    ("AUD", "Australian Dollar", 55.0),
    ("CAD", "Canadian Dollar", 61.0),
    ("NZD", "New Zealand Dollar", 50.0),
    ("CHF", "Swiss Franc", 95.0),
    ("JPY", "Japanese Yen", 0.56),
    ("CNY", "Chinese Yuan", 11.5),
    ("HKD", "Hong Kong Dollar", 10.6),
    ("MYR", "Malaysian Ringgit", 19.0),
    ("THB", "Thai Baht", 2.4),
    ("IDR", "Indonesian Rupiah", 0.0052),
    ("PHP", "Philippine Peso", 1.45),
    ("ZAR", "South African Rand", 4.7),
    ("KES", "Kenyan Shilling", 0.64),
    ("NPR", "Nepalese Rupee", 0.625),
    ("BDT", "Bangladeshi Taka", 0.70),
    ("LKR", "Sri Lankan Rupee", 0.28),
)

_DEFAULT_INR_PER_UNIT = {code: rate for code, _name, rate in DISPLAY_CURRENCIES}
_ALLOWED = frozenset(_DEFAULT_INR_PER_UNIT)


def normalize_display_currency(value: object) -> str:
    code = str(value or "INR").strip().upper()
    if code not in _ALLOWED:
        return "INR"
    return code


def default_inr_per_unit(currency: str) -> float:
    return float(_DEFAULT_INR_PER_UNIT.get(normalize_display_currency(currency), 1.0))


def normalize_inr_per_unit(value: object, currency: str) -> float:
    code = normalize_display_currency(currency)
    if code == "INR":
        return 1.0
    try:
        rate = float(value)
    except (TypeError, ValueError):
        return default_inr_per_unit(code)
    if rate <= 0:
        return default_inr_per_unit(code)
    return rate


def currency_fields_for_tenant(tenant: dict | None) -> dict[str, float | str]:
    data = tenant or {}
    currency = normalize_display_currency(data.get("displayCurrency"))
    stored_rate = data.get("inrPerUnit")
    inr_per_unit = normalize_inr_per_unit(
        stored_rate if stored_rate is not None else default_inr_per_unit(currency),
        currency,
    )
    return {
        "displayCurrency": currency,
        "inrPerUnit": inr_per_unit,
    }
