export type DisplayCurrencyCode =
    | "INR"
    | "USD"
    | "EUR"
    | "GBP"
    | "AED"
    | "SAR"
    | "QAR"
    | "KWD"
    | "BHD"
    | "OMR"
    | "SGD"
    | "AUD"
    | "CAD"
    | "NZD"
    | "CHF"
    | "JPY"
    | "CNY"
    | "HKD"
    | "MYR"
    | "THB"
    | "IDR"
    | "PHP"
    | "ZAR"
    | "KES"
    | "NPR"
    | "BDT"
    | "LKR";

export type DisplayCurrency = {
    code: DisplayCurrencyCode;
    name: string;
    locale: string;
    inrPerUnit: number;
};

export const DISPLAY_CURRENCIES: DisplayCurrency[] = [
    { code: "INR", name: "Indian Rupee (₹)", locale: "en-IN", inrPerUnit: 1 },
    { code: "USD", name: "US Dollar ($)", locale: "en-US", inrPerUnit: 83 },
    { code: "EUR", name: "Euro (€)", locale: "en-IE", inrPerUnit: 90 },
    { code: "GBP", name: "British Pound (£)", locale: "en-GB", inrPerUnit: 105 },
    { code: "AED", name: "UAE Dirham (AED)", locale: "en-AE", inrPerUnit: 22.6 },
    { code: "SAR", name: "Saudi Riyal (SAR)", locale: "en-SA", inrPerUnit: 22.1 },
    { code: "QAR", name: "Qatari Riyal (QAR)", locale: "en-QA", inrPerUnit: 22.8 },
    { code: "KWD", name: "Kuwaiti Dinar (KWD)", locale: "en-KW", inrPerUnit: 270 },
    { code: "BHD", name: "Bahraini Dinar (BHD)", locale: "en-BH", inrPerUnit: 220 },
    { code: "OMR", name: "Omani Rial (OMR)", locale: "en-OM", inrPerUnit: 215 },
    { code: "SGD", name: "Singapore Dollar (S$)", locale: "en-SG", inrPerUnit: 62 },
    { code: "AUD", name: "Australian Dollar (A$)", locale: "en-AU", inrPerUnit: 55 },
    { code: "CAD", name: "Canadian Dollar (C$)", locale: "en-CA", inrPerUnit: 61 },
    { code: "NZD", name: "New Zealand Dollar (NZ$)", locale: "en-NZ", inrPerUnit: 50 },
    { code: "CHF", name: "Swiss Franc (CHF)", locale: "de-CH", inrPerUnit: 95 },
    { code: "JPY", name: "Japanese Yen (¥)", locale: "ja-JP", inrPerUnit: 0.56 },
    { code: "CNY", name: "Chinese Yuan (CN¥)", locale: "zh-CN", inrPerUnit: 11.5 },
    { code: "HKD", name: "Hong Kong Dollar (HK$)", locale: "zh-HK", inrPerUnit: 10.6 },
    { code: "MYR", name: "Malaysian Ringgit (RM)", locale: "en-MY", inrPerUnit: 19 },
    { code: "THB", name: "Thai Baht (฿)", locale: "th-TH", inrPerUnit: 2.4 },
    { code: "IDR", name: "Indonesian Rupiah (Rp)", locale: "id-ID", inrPerUnit: 0.0052 },
    { code: "PHP", name: "Philippine Peso (₱)", locale: "en-PH", inrPerUnit: 1.45 },
    { code: "ZAR", name: "South African Rand (R)", locale: "en-ZA", inrPerUnit: 4.7 },
    { code: "KES", name: "Kenyan Shilling (KSh)", locale: "en-KE", inrPerUnit: 0.64 },
    { code: "NPR", name: "Nepalese Rupee (Re)", locale: "en-NP", inrPerUnit: 0.625 },
    { code: "BDT", name: "Bangladeshi Taka (৳)", locale: "en-BD", inrPerUnit: 0.7 },
    { code: "LKR", name: "Sri Lankan Rupee (Rs)", locale: "en-LK", inrPerUnit: 0.28 },
];

const CURRENCY_BY_CODE = Object.fromEntries(
    DISPLAY_CURRENCIES.map((item) => [item.code, item]),
) as Record<DisplayCurrencyCode, DisplayCurrency>;

const ZERO_DECIMAL = new Set<DisplayCurrencyCode>(["INR", "JPY", "IDR"]);

export type StoreCurrencySettings = {
    displayCurrency?: string | null;
    inrPerUnit?: number | null;
};

export function resolveDisplayCurrency(code?: string | null): DisplayCurrency {
    const normalized = String(code || "INR").trim().toUpperCase();
    return CURRENCY_BY_CODE[normalized as DisplayCurrencyCode] || CURRENCY_BY_CODE.INR;
}

export function resolveInrPerUnit(
    settings?: StoreCurrencySettings | null,
): number {
    const currency = resolveDisplayCurrency(settings?.displayCurrency);
    if (currency.code === "INR") {
        return 1;
    }
    const override = Number(settings?.inrPerUnit);
    if (Number.isFinite(override) && override > 0) {
        return override;
    }
    return currency.inrPerUnit;
}

export function convertInrToDisplay(
    amountInr: number,
    settings?: StoreCurrencySettings | null,
): number {
    const inr = Number(amountInr);
    if (!Number.isFinite(inr)) {
        return 0;
    }
    const rate = resolveInrPerUnit(settings);
    return inr / rate;
}

export function formatStorePrice(
    amountInr: number | null | undefined,
    settings?: StoreCurrencySettings | null,
): string {
    const currency = resolveDisplayCurrency(settings?.displayCurrency);
    const value = convertInrToDisplay(Number(amountInr) || 0, settings);
    const digits = ZERO_DECIMAL.has(currency.code) ? 0 : 2;
    try {
        return new Intl.NumberFormat(currency.locale, {
            style: "currency",
            currency: currency.code,
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(value);
    } catch {
        return `${currency.code} ${value.toFixed(digits)}`;
    }
}
