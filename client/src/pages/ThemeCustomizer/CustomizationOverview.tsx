import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  formatStorefrontHost,
} from "../../features/tenant/tenantHost";
import { usePublicTenants } from "../../features/tenant/api/publicTenants.api";
import { CUSTOMIZATION_GROUPS } from "../../theme/customizationCatalog";
import styles from "./CustomizationOverview.module.css";

const SWIPE_MS = 5000;

type CustomizationOverviewProps = {
  onJumpToTab?: (tabId: string) => void;
};

export default function CustomizationOverview({
  onJumpToTab,
}: CustomizationOverviewProps) {
  const { data: tenants = [], isLoading } = usePublicTenants();
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || tenants.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % tenants.length);
    }, SWIPE_MS);
    return () => window.clearInterval(timer);
  }, [paused, tenants.length]);

  const safeIndex =
    tenants.length === 0
      ? 0
      : ((activeIndex % tenants.length) + tenants.length) % tenants.length;
  const active = tenants[safeIndex] ?? null;

  return (
    <div className={styles.root}>
      <section className={styles.block}>
        <h3>What you can customize</h3>
        <p className={styles.lead}>
          Everything in Store layout studio maps to your live storefront after
          you save to the database.
        </p>
        <ul className={styles.groups}>
          {CUSTOMIZATION_GROUPS.map((group) => (
            <li key={group.id}>
              <button
                type="button"
                className={styles.groupHead}
                onClick={() => onJumpToTab?.(group.id)}
              >
                {group.title}
              </button>
              <ul>
                {group.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section
        className={styles.block}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <h3>One Platform. Many Stores.</h3>
        <p className={styles.lead}>
          Live tenants on Retail Cosmos — same engine, isolated catalogs and
          themes.
        </p>

        {isLoading ? (
          <p className={styles.status}>Loading tenants…</p>
        ) : null}

        {!isLoading && tenants.length === 0 ? (
          <p className={styles.status}>No active tenants yet.</p>
        ) : null}

        {tenants.length > 0 ? (
          <>
            <div className={styles.tenantTabs} role="tablist">
              {tenants.map((tenant, index) => (
                <button
                  key={tenant.tenantId}
                  type="button"
                  role="tab"
                  aria-selected={index === safeIndex}
                  className={
                    index === safeIndex ? styles.tabActive : styles.tab
                  }
                  onClick={() => setActiveIndex(index)}
                >
                  {tenant.name}
                </button>
              ))}
            </div>

            {active ? (
              <article
                className={styles.tenantCard}
                style={{ ["--accent" as string]: active.accent }}
              >
                <div className={styles.tenantMedia}>
                  {active.coverImage || active.previewImages[0] ? (
                    <img
                      src={active.coverImage || active.previewImages[0]}
                      alt=""
                    />
                  ) : (
                    <div className={styles.tenantPlaceholder} />
                  )}
                </div>
                <div className={styles.tenantMeta}>
                  <strong>{active.name}</strong>
                  <span>{formatStorefrontHost(active.slug)}</span>
                  <span>{active.theme}</span>
                  <span>
                    {active.productCount > 0
                      ? `${active.productCount.toLocaleString()}+ products`
                      : "Catalog ready"}
                  </span>
                  <span>{active.dataIsolation}</span>
                  <Link to={`/${active.slug}`}>Open store →</Link>
                </div>
              </article>
            ) : null}

            {tenants.length > 1 ? (
              <div className={styles.dots}>
                {tenants.map((tenant, index) => (
                  <button
                    key={tenant.tenantId}
                    type="button"
                    className={
                      index === safeIndex ? styles.dotActive : styles.dot
                    }
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Show ${tenant.name}`}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
