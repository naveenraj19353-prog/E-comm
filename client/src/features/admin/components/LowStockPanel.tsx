import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { getLowStock } from "../api/stock.api";
import styles from "../styles/LowStockPanel.module.css";

const SHOWN = 6;

const variantLabel = (variant: { color?: string | null; size?: string | null; variantId: string }) =>
    [variant.color, variant.size].filter(Boolean).join(" / ") || variant.variantId;

/** Store dashboard card listing variants at or below the low-stock level (REQ-035). */
export default function LowStockPanel({ tenantId }: { tenantId: string }) {
    const navigate = useNavigate();
    const query = useQuery({
        queryKey: ["admin-low-stock", tenantId],
        queryFn: () => getLowStock(tenantId),
        enabled: Boolean(tenantId),
        staleTime: 60_000,
    });

    if (!query.data || query.data.count === 0) {
        return null;
    }
    const { data, threshold, count, outOfStock } = query.data;

    return (
        <section className={styles.panel} aria-labelledby="low-stock-title">
            <div className={styles.header}>
                <div>
                    <span className={styles.eyebrow}>INVENTORY</span>
                    <h2 id="low-stock-title">Low stock</h2>
                    <p>
                        {count} product{count === 1 ? "" : "s"} at or below {threshold} in stock
                        {outOfStock ? ` · ${outOfStock} out of stock` : ""}.
                    </p>
                </div>
                <button
                    type="button"
                    className={styles.link}
                    onClick={() => navigate(`/admin/tenants/${tenantId}/products`)}
                >
                    Open products
                </button>
            </div>
            <ul className={styles.list}>
                {data.slice(0, SHOWN).map((item) => (
                    <li key={item.productId}>
                        <strong>{item.name}</strong>
                        <span>
                            {item.variants
                                .slice(0, 4)
                                .map((variant) =>
                                    `${variantLabel(variant)}: ${variant.stock <= 0 ? "out" : variant.stock}`,
                                )
                                .join(" · ")}
                            {item.variants.length > 4 ? ` · +${item.variants.length - 4} more` : ""}
                        </span>
                    </li>
                ))}
            </ul>
            {data.length > SHOWN ? (
                <p className={styles.more}>and {data.length - SHOWN} more…</p>
            ) : null}
        </section>
    );
}
