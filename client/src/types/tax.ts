/**
 * GST shapes shared by the cart, checkout and order screens.
 *
 * These mirror `app/services/tax_service.py`. Everything here is optional on
 * the wire: a store that charges no tax sends an all-zero block, and the UI is
 * expected to render nothing rather than a row of zeroes.
 */

/** A rate-wise bucket, the shape a GST summary is usually shown in. */
export interface TaxRateBucket {
    rate: number;
    taxableValue: number;
    tax: number;
}

/** One cart line's tax, in cart order. */
export interface TaxLine {
    name: string;
    hsnCode?: string | null;
    gstRate: number;
    discount: number;
    net: number;
    taxableValue: number;
    taxAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
}

export interface StoreTax {
    /** True when the listed price already contains GST (the Indian retail norm). */
    taxInclusive: boolean;
    /** A composition dealer may not show a tax split on the bill. */
    compositionScheme: boolean;
    interState: boolean;
    placeOfSupply?: string | null;
    sellerStateCode?: string | null;
    shippingTaxable: boolean;
    shippingTax: number;
    taxableValue: number;
    totalTax: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    roundOff: number;
    grandTotal: number;
    /** True when the buyer's state could not be read and the seller's was assumed. */
    assumedSellerState?: boolean;
    rateWise?: TaxRateBucket[];
    lines?: TaxLine[];
}
