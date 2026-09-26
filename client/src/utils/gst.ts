/**
 * GST helpers shared by the admin forms, mirroring the backend's validation in
 * `app/services/tax_service.py`. Keeping the slab list in one place stops the
 * product form and the tax settings page from drifting apart.
 */

/** The statutory slabs. Anything else is rejected, not clamped. */
export const GST_RATES = [0, 0.5, 3, 5, 12, 18, 28] as const;

/** Shown next to a rate input; "0" needs explaining where the others don't. */
export const GST_RATE_LABELS: Record<string, string> = {
    "0": "0% — exempt / nil-rated",
    "0.5": "0.5%",
    "3": "3%",
    "5": "5%",
    "12": "12%",
    "18": "18%",
    "28": "28%",
};

/** HSN (goods) and SAC (services) codes are 4, 6 or 8 digits. */
export const HSN_PATTERN = /^\d{4}(\d{2})?(\d{2})?$/;

export interface ValidationResult {
    ok: boolean;
    message?: string;
}

/** Blank is allowed and means "inherit the category, then the store default". */
export function validateHsnCode(value: string): ValidationResult {
    const code = value.trim();
    if (!code) {
        return { ok: true };
    }
    if (!HSN_PATTERN.test(code)) {
        return { ok: false, message: "HSN code must be 4, 6 or 8 digits." };
    }
    return { ok: true };
}

export function validateGstRate(value: string): ValidationResult {
    const raw = value.trim();
    if (!raw) {
        return { ok: true };
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) {
        return { ok: false, message: "GST rate must be a number." };
    }
    if (!GST_RATES.includes(numeric as (typeof GST_RATES)[number])) {
        return {
            ok: false,
            message: `GST rate must be one of: ${GST_RATES.join(", ")}.`,
        };
    }
    return { ok: true };
}

/** `""` (unset) becomes null so the backend falls through to the next source. */
export function toGstRate(value: string): number | null {
    const raw = value.trim();
    if (!raw) {
        return null;
    }
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : null;
}

export function toHsnCode(value: string): string | undefined {
    return value.trim() || undefined;
}
