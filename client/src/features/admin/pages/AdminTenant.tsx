import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasStorePermission } from "../../auth/permissions";
import { isStoreOwner, isStoreStaff } from "../../auth/roles";
import { useTenantByTenantId } from "../hooks/useTenants";
import { useProducts } from "../hooks/useTenantProducts";
import LowStockPanel from "../components/LowStockPanel";
import { lowStockThresholdOf } from "../api/stock.api";
import styles from "../styles/AdminTenant.module.css";
import { formatStorefrontHost } from "../../tenant/tenantHost";
import { isRetailBusiness } from "../../tenant/businessMode";
import { routes, storefrontNavigate } from "../../../routes/routes";
export default function AdminTenant() {
    const { tenantId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const showBackToTenants = user?.role === "super_admin";
    const { data: tenant, isLoading, isError, } = useTenantByTenantId(tenantId || "");
    const productsQuery = useProducts({
        tenantId: tenantId || "",
        page: 1,
        limit: 1,
        includeInactive: true,
    });
    const hasProducts = Boolean(
        productsQuery.data?.pages?.some((page) => {
            if (Array.isArray(page)) {
                return page.length > 0;
            }
            return Array.isArray(page?.data) && page.data.length > 0;
        }),
    );
    if (isLoading) {
        return (<div className={styles.state}>
        <div className={styles.spinner}/>
        <p>Loading tenant...</p>
      </div>);
    }
    if (isError || !tenant) {
        return (<div className={styles.state}>
        <h2>Tenant not found</h2>
        <p>
          Unable to find tenant <strong>{tenantId}</strong>.
        </p>
        <button type="button" className={styles.backButton} onClick={() => navigate("/admin/tenants")}>
          ← Back to Tenants
        </button>
      </div>);
    }
    if (
        isStoreStaff(user?.role)
        && hasStorePermission(user, "products_update")
        && !productsQuery.isLoading
        && !productsQuery.isError
        && !hasProducts
    ) {
        return (
            <Navigate
                to={`/admin/tenants/${tenant.tenantId}/products/create`}
                replace
            />
        );
    }
    const storeHost = formatStorefrontHost(tenant.slug);
    const isRetail = isRetailBusiness(tenant.businessType);
    const openStore = (path: string) => storefrontNavigate(navigate, path);
    return (<div className={styles.page}>
      
      <div className={styles.header}>
        <div>
          {showBackToTenants && (
          <button type="button" className={styles.backButton} onClick={() => navigate("/admin/tenants")}>
            ← Back to Tenants
          </button>
          )}
          <div className={styles.eyebrow}>{tenant.tenantId}</div>
          <h1>{tenant.name}</h1>
          <p>{storeHost}</p>
        </div>
      </div>
      
      <div className={styles.statusCard}>
        <div className={styles.statusInfo}>
          <span className={styles.statusLabel}>Status</span>
          <span className={tenant.isActive ? styles.active : styles.inactive}>
            <span className={styles.statusDot}/>
            {tenant.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      </div>

      {hasStorePermission(user, "read") ? <LowStockPanel tenantId={tenant.tenantId}/> : null}
      
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>TENANT</span>
            <h2>Tenant Information</h2>
            <p>Details and configuration for this store.</p>
          </div>
        </div>
        <div className={styles.infoGrid}>
          
          <div className={styles.infoCard}>
            <span>Tenant ID</span>
            <strong>{tenant.tenantId}</strong>
          </div>
          
          <div className={styles.infoCard}>
            <span>Store Name</span>
            <strong>{tenant.name}</strong>
          </div>
          
          <div className={styles.infoCard}>
            <span>Store Slug</span>
            <strong>{storeHost}</strong>
          </div>
          
          <div className={styles.infoCard}>
            <span>Business type</span>
            <strong>
              {tenant.businessType
                ? tenant.businessType.charAt(0).toUpperCase() +
                  tenant.businessType.slice(1)
                : "Retail"}
            </strong>
          </div>

          <div className={styles.infoCard}>
            <span>Theme</span>
            <strong>{tenant.theme || "green"}</strong>
          </div>

          <div className={styles.infoCard}>
            <span>Storefront currency</span>
            <strong>{tenant.displayCurrency || "INR"}</strong>
          </div>

          <div className={styles.infoCard}>
            <span>Low stock alert at</span>
            <strong>
              {lowStockThresholdOf(tenant) === 0
            ? "Off"
            : `${lowStockThresholdOf(tenant)} or fewer`}
            </strong>
          </div>
          
          <div className={styles.infoCard}>
            <span>Created</span>
            <strong>
              {tenant.createdAt
            ? new Date(tenant.createdAt).toLocaleDateString("en-IN")
            : "-"}
            </strong>
          </div>
          
          <div className={styles.infoCard}>
            <span>Last Updated</span>
            <strong>
              {tenant.updatedAt
            ? new Date(tenant.updatedAt).toLocaleDateString("en-IN")
            : "-"}
            </strong>
          </div>
        </div>
      </section>
      
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>STORE</span>
            <h2>Store Preview</h2>
            <p>Preview the tenant storefront.</p>
          </div>
        </div>
        <div className={styles.storeCard}>
          <div className={styles.storeLogo}>
            {tenant.logo ? (<img src={tenant.logo} alt={tenant.name}/>) : (tenant?.name?.charAt(0).toUpperCase())}
          </div>
          <div className={styles.storeInfo}>
            <h3>{tenant.name}</h3>
            <p>{storeHost}</p>
            <span>Theme: {tenant.theme || "green"}</span>
          </div>
          <button type="button" className={styles.viewStoreButton} onClick={() => openStore(routes.home(tenant.slug))}>
            View Store →
          </button>
        </div>
      </section>
      
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>MANAGEMENT</span>
            <h2>Actions</h2>
            <p>Manage this tenant.</p>
          </div>
        </div>
        <div className={styles.actionsGrid}>
          {hasStorePermission(user, "layout") ? (
          <button type="button" className={styles.actionCard} onClick={() => openStore(routes.customize(tenant.slug))}>
            <div className={styles.actionIcon}>▣</div>
            <div>
              <strong>Layout Studio</strong>
              <span>Customize storefront layout, theme, and content.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {isStoreOwner(user?.role) || user?.role === "super_admin" ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/team`)}>
            <div className={styles.actionIcon}>☺</div>
            <div>
              <strong>Store managers</strong>
              <span>Add a manager login for this store.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {isStoreOwner(user?.role) || user?.role === "super_admin" ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/edit`)}>
            <div className={styles.actionIcon}>✎</div>
            <div>
              <strong>Edit Tenant</strong>
              <span>Update store information, theme and status.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}
          
          {hasStorePermission(user, "products_update") || hasStorePermission(user, "inventory") || hasStorePermission(user, "read") ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/products`)}>
            <div className={styles.actionIcon}>◫</div>
            <div>
              <strong>Manage Products</strong>
              <span>View and manage products for this tenant.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {hasStorePermission(user, "customers") ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/customers`)}>
            <div className={styles.actionIcon}>☺</div>
            <div>
              <strong>Customers</strong>
              <span>View customers for this store.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {hasStorePermission(user, "customers") ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/messages`)}>
            <div className={styles.actionIcon}>✉</div>
            <div>
              <strong>Messages</strong>
              <span>Read Contact page submissions.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {hasStorePermission(user, "whatsapp") ? (
          <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/integrations/periskope`)}>
            <div className={styles.actionIcon}>◌</div>
            <div>
              <strong>WhatsApp Notifications</strong>
              <span>Configure Periskope events and review delivery attempts.</span>
            </div>
            <b>→</b>
          </button>
          ) : null}

          {tenant.businessType === "menu" ? (
            hasStorePermission(user, "menu") ? (
            <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/menu`)}>
              <div className={styles.actionIcon}>☰</div>
              <div>
                <strong>Menu Desk</strong>
                <span>Manage live menu orders from the kitchen desk.</span>
              </div>
              <b>→</b>
            </button>
            ) : null
          ) : (
            <>
              {isRetail && hasStorePermission(user, "orders") ? (
                <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/orders`)}>
                  <div className={styles.actionIcon}>⧉</div>
                  <div>
                    <strong>Manage Orders</strong>
                    <span>View, fulfill, and cancel customer orders.</span>
                  </div>
                  <b>→</b>
                </button>
              ) : null}

              {isRetail && hasStorePermission(user, "orders") ? (
                <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/analytics`)}>
                  <div className={styles.actionIcon}>▤</div>
                  <div>
                    <strong>Sales Dashboard</strong>
                    <span>Net sales, orders, average order value and top products.</span>
                  </div>
                  <b>→</b>
                </button>
              ) : null}

              {hasStorePermission(user, "banners") ? (
              <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/banners`)}>
                <div className={styles.actionIcon}>▣</div>
                <div>
                  <strong>Manage Banners</strong>
                  <span>Upload home hero images, titles, and CTAs.</span>
                </div>
                <b>→</b>
              </button>
              ) : null}

              {hasStorePermission(user, "coupons") ? (
              <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/coupons`)}>
                <div className={styles.actionIcon}>%</div>
                <div>
                  <strong>Coupons</strong>
                  <span>First-order, product, and festival offers for checkout.</span>
                </div>
                <b>→</b>
              </button>
              ) : null}

              {isRetail && hasStorePermission(user, "shipping") ? (
                <button type="button" className={styles.actionCard} onClick={() => navigate(`/admin/tenants/${tenant.tenantId}/shipping/delhivery`)}>
                  <div className={styles.actionIcon}>⬡</div>
                  <div>
                    <strong>Delhivery Shipping</strong>
                    <span>Connect API token and register pickup location.</span>
                  </div>
                  <b>→</b>
                </button>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>);
}
