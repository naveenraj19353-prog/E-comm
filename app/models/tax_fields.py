"""Reusable pydantic field types for GST data on products and categories.

Kept out of ``app/services/tax_service.py`` so that module stays stdlib-only and
therefore runnable in a bare interpreter (which is how its tests are executed).
"""

from __future__ import annotations

from typing import Annotated, Optional

from pydantic import BeforeValidator

from app.services.tax_service import normalize_gst_rate, normalize_hsn

#: HSN/SAC code: 4, 6 or 8 digits, blank allowed.
HsnCode = Annotated[Optional[str], BeforeValidator(normalize_hsn)]

#: GST rate in percent, limited to the statutory slabs, blank allowed.
GstRate = Annotated[Optional[float], BeforeValidator(normalize_gst_rate)]

__all__ = ["GstRate", "HsnCode"]
