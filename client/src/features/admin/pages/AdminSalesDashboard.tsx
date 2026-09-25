import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTenantByTenantId } from "../hooks/useTenants";
import { getSalesReport, type SalesGroupBy, type SalesReport } from "../api/salesReport.api";
import { formatOrderAmount, orderStatusLabel } from "../../orders/api/order.api";
import type { OrderStatus } from "../../orders/types/order.types";
import styles from "../styles/AdminSalesDashboard.module.css";

type Preset = "7d" | "30d" | "90d" | "12m" | "custom";

const PRESETS: Array<{ id: Exclude<Preset, "custom">; label: string; days: number }> = [
    { id: "7d", label: "7 days", days: 7 },
    { id: "30d", label: "30 days", days: 30 },
    { id: "90d", label: "90 days", days: 90 },
    { id: "12m", label: "12 months", days: 365 },
];

const toIsoDay = (value: Date) => {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
};

const rangeFor = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - (days - 1));
    return { from: toIsoDay(from), to: toIsoDay(to) };
};

const periodLabel = (period: string, groupBy: SalesGroupBy) => {
    const date = new Date(`${period}T00:00:00`);
    if (groupBy === "month") {
        return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    }
    return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

/** Axis labels in Indian units: ₹950, ₹12K, ₹4.5L, ₹1.2Cr. */
const compactAmount = (value: number) => {
    const trim = (n: number) => (Math.round(n * 10) / 10).toString();
    if (value >= 1e7) return `₹${trim(value / 1e7)}Cr`;
    if (value >= 1e5) return `₹${trim(value / 1e5)}L`;
    if (value >= 1e3) return `₹${trim(value / 1e3)}K`;
    return `₹${Math.round(value)}`;
};

/** Smallest "nice" axis max (4 even steps of 1/2/2.5/5 × 10ⁿ) that fits the value. */
const niceMax = (value: number) => {
    if (value <= 0) return 4;
    const rawStep = value / 4;
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;
    return step * 4;
};

function SalesChart({ report }: { report: SalesReport }) {
    const [hover, setHover] = useState<number | null>(null);
    const series = report.series;
    const max = niceMax(Math.max(0, ...series.map((point) => point.netSales)));
    const width = 720;
    const height = 240;
    const pad = { top: 12, right: 12, bottom: 28, left: 64 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const slot = plotW / Math.max(1, series.length);
    const barW = Math.max(2, Math.min(28, slot - 2));
    const labelEvery = Math.max(1, Math.ceil(series.length / 8));
    const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i);
    const hovered = hover !== null ? series[hover] : null;

    return (
        <div className={styles.chartWrap}>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className={styles.chart}
                role="img"
                aria-label={`Net sales by ${report.groupBy}, ${report.from} to ${report.to}`}
                onMouseLeave={() => setHover(null)}
            >
                {ticks.map((tick) => {
                    const y = pad.top + plotH - (tick / max) * plotH;
                    return (
                        <g key={tick}>
                            <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className={styles.grid} />
                            <text x={pad.left - 8} y={y + 4} textAnchor="end" className={styles.axisText}>
                                {compactAmount(tick)}
                            </text>
                        </g>
                    );
                })}
                {series.map((point, index) => {
                    const x = pad.left + index * slot + (slot - barW) / 2;
                    const h = (point.netSales / max) * plotH;
                    const y = pad.top + plotH - h;
                    const r = Math.min(4, barW / 2, h);
                    return (
                        <g key={point.period} onMouseEnter={() => setHover(index)}>
                            {/* Full-height hit area, wider than the bar. */}
                            <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                            {h > 0 ? (
                                <path
                                    className={hover === index ? styles.barActive : styles.bar}
                                    d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                                />
                            ) : null}
                            {index % labelEvery === 0 ? (
                                <text x={x + barW / 2} y={height - 8} textAnchor="middle" className={styles.axisText}>
                                    {periodLabel(point.period, report.groupBy)}
                                </text>
                            ) : null}
                        </g>
                    );
                })}
                <line x1={pad.left} x2={width - pad.right} y1={pad.top + plotH} y2={pad.top + plotH} className={styles.baseline} />
            </svg>
            {hovered ? (
                <div
                    className={styles.tooltip}
                    style={{ left: `${((pad.left + (hover! + 0.5) * slot) / width) * 100}%` }}
                    role="status"
                >
                    <strong>{periodLabel(hovered.period, report.groupBy)}</strong>
                    <span>{formatOrderAmount(hovered.netSales)}</span>
                    <span>
                        {hovered.orders} order{hovered.orders === 1 ? "" : "s"}
                    </span>
                </div>
            ) : null}
        </div>
    );
}

export default function AdminSalesDashboard() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const { data: tenant } = useTenantByTenantId(tenantId);
    const [preset, setPreset] = useState<Preset>("30d");
    const [custom, setCustom] = useState(() => rangeFor(30));
    const [showTable, setShowTable] = useState(false);

    const range = useMemo(() => {
        if (preset === "custom") return custom;
        return rangeFor(PRESETS.find((item) => item.id === preset)!.days);
    }, [preset, custom]);
    const groupBy: SalesGroupBy | undefined = preset === "12m" ? "month" : undefined;

    const query = useQuery({
        queryKey: ["admin-sales-report", tenantId, range.from, range.to, groupBy],
        queryFn: () => getSalesReport(tenantId, { from: range.from, to: range.to, groupBy }),
        enabled: Boolean(tenantId) && Boolean(range.from && range.to) && range.from <= range.to,
        placeholderData: keepPreviousData,
    });
    const report = query.data;
    const statusRows = Object.entries(report?.statusCounts ?? {}).sort((a, b) => b[1] - a[1]);

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <button type="button" className={styles.back} onClick={() => navigate(`/admin/tenants/${tenantId}`)}>
                        ← Back to store
                    </button>
                    <span className={styles.eyebrow}>SALES</span>
                    <h1>{tenant?.name || "Store"} sales</h1>
                    <p>Net sales are order totals minus refunds. Cancelled orders are left out.</p>
                </div>
            </header>

            <div className={styles.filters}>
                <div className={styles.presets} role="group" aria-label="Date range">
                    {PRESETS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            className={preset === item.id ? styles.presetActive : styles.preset}
                            onClick={() => setPreset(item.id)}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        className={preset === "custom" ? styles.presetActive : styles.preset}
                        onClick={() => setPreset("custom")}
                    >
                        Custom
                    </button>
                </div>
                {preset === "custom" ? (
                    <div className={styles.custom}>
                        <label>
                            From
                            <input
                                type="date"
                                value={custom.from}
                                max={custom.to}
                                onChange={(event) => setCustom((prev) => ({ ...prev, from: event.target.value }))}
                            />
                        </label>
                        <label>
                            To
                            <input
                                type="date"
                                value={custom.to}
                                min={custom.from}
                                onChange={(event) => setCustom((prev) => ({ ...prev, to: event.target.value }))}
                            />
                        </label>
                    </div>
                ) : null}
                {query.isFetching ? <span className={styles.muted}>Updating…</span> : null}
            </div>

            {query.isError ? (
                <div className={styles.state}>Could not load sales. Please try again.</div>
            ) : !report ? (
                <div className={styles.state}>Loading sales…</div>
            ) : (
                <>
                    <div className={styles.tiles}>
                        <div className={styles.tile}>
                            <span>Net sales</span>
                            <strong>{formatOrderAmount(report.totals.netSales)}</strong>
                        </div>
                        <div className={styles.tile}>
                            <span>Orders</span>
                            <strong>{report.totals.orders}</strong>
                        </div>
                        <div className={styles.tile}>
                            <span>Average order value</span>
                            <strong>{formatOrderAmount(report.totals.averageOrderValue)}</strong>
                        </div>
                        <div className={styles.tile}>
                            <span>Cancelled</span>
                            <strong>{report.totals.cancelled}</strong>
                        </div>
                        <div className={styles.tile}>
                            <span>Refunded</span>
                            <strong>{formatOrderAmount(report.totals.refunded)}</strong>
                        </div>
                    </div>

                    <section className={styles.card}>
                        <div className={styles.cardHeader}>
                            <h2>Net sales by {report.groupBy}</h2>
                            <button type="button" className={styles.linkButton} onClick={() => setShowTable((v) => !v)}>
                                {showTable ? "Show chart" : "Show as table"}
                            </button>
                        </div>
                        {report.totals.orders === 0 ? (
                            <p className={styles.muted}>No orders in this period.</p>
                        ) : showTable ? (
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Period</th>
                                            <th>Orders</th>
                                            <th>Net sales</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.series.map((point) => (
                                            <tr key={point.period}>
                                                <td>{periodLabel(point.period, report.groupBy)}</td>
                                                <td>{point.orders}</td>
                                                <td>{formatOrderAmount(point.netSales)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <SalesChart report={report} />
                        )}
                    </section>

                    <div className={styles.twoCol}>
                        <section className={styles.card}>
                            <h2>Top products</h2>
                            {report.topProducts.length === 0 ? (
                                <p className={styles.muted}>No sales yet.</p>
                            ) : (
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th>Product</th>
                                            <th>Units</th>
                                            <th>Sales</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {report.topProducts.map((item) => (
                                            <tr key={item.productId}>
                                                <td>{item.name}</td>
                                                <td>{item.units}</td>
                                                <td>{formatOrderAmount(item.sales)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                        <section className={styles.card}>
                            <h2>Orders by status</h2>
                            {statusRows.length === 0 ? (
                                <p className={styles.muted}>No orders yet.</p>
                            ) : (
                                <table className={styles.table}>
                                    <tbody>
                                        {statusRows.map(([status, count]) => (
                                            <tr key={status}>
                                                <td>{orderStatusLabel[status as OrderStatus] ?? status}</td>
                                                <td className={styles.num}>{count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    </div>
                </>
            )}
        </div>
    );
}
