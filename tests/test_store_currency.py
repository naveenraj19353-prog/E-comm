from app.services.store_currency import (
    currency_fields_for_tenant,
    normalize_display_currency,
    normalize_inr_per_unit,
)


def test_unknown_currency_falls_back_to_inr():
    assert normalize_display_currency("xyz") == "INR"
    assert normalize_display_currency(None) == "INR"


def test_usd_uses_built_in_rate_when_missing():
    fields = currency_fields_for_tenant({"displayCurrency": "USD"})
    assert fields["displayCurrency"] == "USD"
    assert fields["inrPerUnit"] == 83.0


def test_admin_can_override_inr_rate():
    fields = currency_fields_for_tenant(
        {"displayCurrency": "USD", "inrPerUnit": 90}
    )
    assert fields["inrPerUnit"] == 90.0


def test_inr_rate_stays_one():
    assert normalize_inr_per_unit(50, "INR") == 1.0
