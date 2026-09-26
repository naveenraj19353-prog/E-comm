import styles from "./TaxBreakdown.module.css";
import type { StoreTax } from "../../types/tax";
import { useFormatStorePrice } from "../../features/tenant/useFormatStorePrice";

interface TaxBreakdownProps {
  tax?: StoreTax | null;
  /** Render the GSTIN-style "tax included" note under the total. */
  showInclusiveNote?: boolean;
  /**
   * True before a delivery address is chosen, where CGST/SGST vs IGST is not
   * yet determined and the split can still change.
   */
  provisional?: boolean;
}

/**
 * The GST split for a cart or order.
 *
 * Renders nothing at all when the store charges no tax, so this can be dropped
 * into any summary without a feature flag or a visible empty block.
 */
const TaxBreakdown = ({
  tax,
  showInclusiveNote = true,
  provisional = false,
}: TaxBreakdownProps) => {
  const { formatPrice } = useFormatStorePrice();

  if (!tax || tax.totalTax <= 0) {
    return null;
  }

  // A composition dealer may not show a tax split on the bill at all.
  if (tax.compositionScheme) {
    return null;
  }

  const hasCess = (tax.cess ?? 0) > 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.rows}>
        <div className={styles.row}>
          <span>Taxable value</span>
          <span>{formatPrice(tax.taxableValue)}</span>
        </div>

        {tax.interState ? (
          <div className={styles.row}>
            <span>IGST</span>
            <span>{formatPrice(tax.igst)}</span>
          </div>
        ) : (
          <>
            <div className={styles.row}>
              <span>CGST</span>
              <span>{formatPrice(tax.cgst)}</span>
            </div>
            <div className={styles.row}>
              <span>SGST</span>
              <span>{formatPrice(tax.sgst)}</span>
            </div>
          </>
        )}

        {hasCess && (
          <div className={styles.row}>
            <span>Cess</span>
            <span>{formatPrice(tax.cess)}</span>
          </div>
        )}

        {(tax.shippingTax ?? 0) > 0 && (
          <div className={styles.row}>
            <span>GST on delivery</span>
            <span>{formatPrice(tax.shippingTax)}</span>
          </div>
        )}

        <div className={`${styles.row} ${styles.totalRow}`}>
          <span>Total GST</span>
          <span>{formatPrice(tax.totalTax)}</span>
        </div>
      </div>

      {tax.assumedSellerState && (
        <p className={styles.note}>
          {provisional
            ? "GST is confirmed once a delivery address is chosen."
            : "Delivery state could not be read, so this is charged as a within-state sale. Check the address before invoicing."}
        </p>
      )}

      {showInclusiveNote && tax.taxInclusive && (
        <p className={styles.note}>
          Prices include GST. You are not charged anything extra.
        </p>
      )}
    </div>
  );
};

export default TaxBreakdown;
