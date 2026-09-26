import { Link, NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { hasStorePermission } from "../../auth/permissions";
import { isStoreStaff, storeRoleLabel } from "../../auth/roles";
import { usePageSeo } from "../../seo";
import { useTenantByTenantId } from "../hooks/useTenants";
import { useBillingStatus } from "../hooks/useBilling";
import { formatBillingPrice, formatTrialDaysLeft, type BillingStatus } from "../api/billing.api";
import { formatOrderDate } from "../../orders/api/order.api";
import { isMenuBusiness, isRetailBusiness } from "../../tenant/businessMode";
import { routes, storefrontNavigate } from "../../../routes/routes";
import styles from "../styles/AdminLayout.module.css";
import BrandMark from "../../../components/BrandMark/BrandMark";

const BILLING_BANNER_TRIAL_DAYS = 14;

interface BillingBannerContent {
    tone: "info" | "warning" | "danger";
    message: string;
    linkLabel: string;
}

function billingBannerContent(billing?: BillingStatus): BillingBannerContent | null {
    if (!billing) {
        return null;
    }
    const price = formatBillingPrice(billing.priceInr);
    if (
        billing.status === "trialing" &&
        !billing.autopaySetUp &&
        billing.trialDaysLeft !== null &&
        billing.trialDaysLeft <= BILLING_BANNER_TRIAL_DAYS
    ) {
        return {
            tone: "info",
            message: `Free trial — ${formatTrialDaysLeft(billing.trialDaysLeft)} (ends ${formatOrderDate(billing.trialEndsAt || undefined)}). Set up auto-pay now; the first charge is on the day your trial ends.`,
            linkLabel: `Set up auto-pay — ${price}`,
        };
    }
    if (billing.status === "past_due") {
        return {
            tone: "warning",
            message: `Payment due — your store goes offline on ${formatOrderDate(billing.graceEndsAt || undefined)} unless payment is set up.`,
            linkLabel: `Pay ${price} now`,
        };
    }
    if (billing.status === "suspended") {
        return {
            tone: "danger",
            message: "Your store is offline. Customers can't see it or place orders.",
            linkLabel: `Reactivate — ${price}`,
        };
    }
    return null;
}

function tenantIdFromAdminPath(pathname: string) {
    const match = pathname.match(/^\/admin\/tenants\/([^/]+)/);
    const id = match?.[1] || "";
    if (!id || id === "create") {
        return "";
    }
    return id;
}

export default function AdminLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const { user, isAuthenticated, logout } = useAuth();
    const pathname = location.pathname;
    const storeTenantId =
        isStoreStaff(user?.role)
            ? user.tenantId || ""
            : tenantIdFromAdminPath(pathname);
    const { data: storeTenant } = useTenantByTenantId(storeTenantId);
    const { data: billingStatus } = useBillingStatus(
        storeTenantId,
        user?.role === "admin" && Boolean(storeTenantId),
    );
    const showMenuDesk = isMenuBusiness(storeTenant?.businessType);
    const showRetailExtras = isRetailBusiness(storeTenant?.businessType);
    const showBanners = !showMenuDesk;
    const showStoreNav = Boolean(storeTenantId);
    const navClass = ({ isActive }: { isActive: boolean }) =>
        `${styles.navItem} ${isActive ? styles.active : ""}`;
    usePageSeo({
        title: "Admin",
        description: "Retail Cosmos admin portal.",
        path: location.pathname,
        noIndex: true,
    });
    if (!isAuthenticated || !user) {
        return (<Navigate to="/admin/login" replace state={{
                from: location.pathname,
            }}/>);
    }
    const isSuperAdmin = user.role === "super_admin";
    const isAdmin = isStoreStaff(user.role);
    const isStoreOwner = user.role === "admin";
    const can = (permission: Parameters<typeof hasStorePermission>[1]) =>
        hasStorePermission(user, permission);
    if (!isSuperAdmin && !isAdmin) {
        return (<Navigate to="/admin/login" replace/>);
    }
    if (isSuperAdmin &&
        user.tenantId !== null &&
        user.tenantId !== undefined) {
        logout();
        return (<Navigate to="/admin/login" replace/>);
    }
    if (isAdmin &&
        !user.tenantId) {
        logout();
        return (<Navigate to="/admin/login" replace/>);
    }
    if (isAdmin &&
        pathname === "/admin") {
        return (<Navigate to={`/admin/tenants/${user.tenantId}`} replace/>);
    }
    if (isAdmin &&
        (pathname === "/admin/tenants" ||
            pathname === "/admin/tenants/")) {
        return (<Navigate to={`/admin/tenants/${user.tenantId}`} replace/>);
    }
    if (isAdmin &&
        (pathname === "/admin/payouts" ||
            pathname === "/admin/payouts/" ||
            pathname === "/admin/billing" ||
            pathname === "/admin/billing/")) {
        return (<Navigate to={`/admin/tenants/${user.tenantId}`} replace/>);
    }
    if (isAdmin &&
        pathname === "/admin/tenants/create") {
        return (<Navigate to={`/admin/tenants/${user.tenantId}`} replace/>);
    }
    if (isAdmin) {
        const tenantPrefix = "/admin/tenants/";
        if (pathname.startsWith(tenantPrefix)) {
            const remainingPath = pathname.substring(tenantPrefix.length);
            const requestedTenantId = remainingPath.split("/")[0];
            if (requestedTenantId &&
                requestedTenantId !==
                    user.tenantId) {
                return (<Navigate to={`/admin/tenants/${user.tenantId}`} replace/>);
            }
        }
    }
    const billingPagePath = `/admin/tenants/${storeTenantId}/billing`;
    const billingBanner =
        isStoreOwner && pathname !== billingPagePath
            ? billingBannerContent(billingStatus)
            : null;
    return (<div className={styles.layout}>
      
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            <BrandMark className={styles.logoMarkImg} />
          </div>
          <div>
            <h2>Retail Cosmos</h2>
            <span>
              Admin Portal
            </span>
          </div>
        </div>
        <nav className={styles.navigation}>
          
          {isSuperAdmin && (
            <NavLink to="/admin" end className={navClass}>
              <span>▦</span>
              Dashboard
            </NavLink>
          )}

          {isSuperAdmin && (
            <NavLink to="/admin/tenants" end className={navClass}>
              <span>◉</span>
              Tenants
            </NavLink>
          )}

          {showStoreNav && (
            <NavLink to={`/admin/tenants/${storeTenantId}`} end className={navClass}>
              <span>◉</span>
              My Store
            </NavLink>
          )}

          {showStoreNav && (can("products_update") || can("inventory") || can("read")) && (
            <NavLink to={`/admin/tenants/${storeTenantId}/products`} className={navClass}>
              <span>◫</span>
              Products
            </NavLink>
          )}

          {showStoreNav && showRetailExtras && can("orders") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/orders`} className={navClass}>
              <span>⧉</span>
              Orders
            </NavLink>
          )}

          {showStoreNav && showMenuDesk && can("menu") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/menu`} className={navClass}>
              <span>▤</span>
              Menu Desk
            </NavLink>
          )}

          {showStoreNav && can("customers") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/customers`} className={navClass}>
              <span>◎</span>
              Customers
            </NavLink>
          )}

          {showStoreNav && can("customers") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/messages`} className={navClass}>
              <span>✉</span>
              Messages
            </NavLink>
          )}

          {showStoreNav && showBanners && can("banners") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/banners`} className={navClass}>
              <span>▣</span>
              Banners
            </NavLink>
          )}

          {showStoreNav && showBanners && can("coupons") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/coupons`} className={navClass}>
              <span>%</span>
              Coupons
            </NavLink>
          )}

          {showStoreNav && showRetailExtras && can("shipping") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/shipping/delhivery`} className={navClass}>
              <span>⬡</span>
              Shipping
            </NavLink>
          )}

          {/* Retail only for now. Backend routes are not business-type gated,
              so this and the route guard are what keep it off menu stores. */}
          {showStoreNav && showRetailExtras && can("products_update") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/tax`} className={navClass}>
              <span>₹</span>
              Tax &amp; GST
            </NavLink>
          )}

          {showStoreNav && can("whatsapp") && (
            <NavLink to={`/admin/tenants/${storeTenantId}/integrations/periskope`} className={navClass}>
              <span>◌</span>
              WhatsApp
            </NavLink>
          )}

          {showStoreNav && storeTenant?.slug && can("layout") && (
            <button
              type="button"
              className={styles.navItem}
              onClick={() =>
                storefrontNavigate(navigate, routes.customize(storeTenant.slug))
              }
            >
              <span>▧</span>
              Layout Studio
            </button>
          )}

          {showStoreNav && (isStoreOwner || isSuperAdmin) && (
            <NavLink to={`/admin/tenants/${storeTenantId}/team`} className={navClass}>
              <span>☺</span>
              Team
            </NavLink>
          )}

          {showStoreNav && (isStoreOwner || isSuperAdmin) && (
            <NavLink to={`/admin/tenants/${storeTenantId}/payments`} className={navClass}>
              <span>₹</span>
              Payments
            </NavLink>
          )}

          {showStoreNav && (isStoreOwner || isSuperAdmin) && (
            <NavLink to={`/admin/tenants/${storeTenantId}/billing`} className={navClass}>
              <span>▭</span>
              Billing
            </NavLink>
          )}

          {showStoreNav && (isStoreOwner || isSuperAdmin) && (
            <NavLink to={`/admin/tenants/${storeTenantId}/edit`} className={navClass}>
              <span>✎</span>
              Edit Tenant
            </NavLink>
          )}
          <div className={styles.sectionTitle}>
            PLATFORM
          </div>

          {isSuperAdmin && (
            <NavLink to="/admin/payouts" className={navClass}>
              <span>₹</span>
              Payouts
            </NavLink>
          )}

          {isSuperAdmin && (
            <NavLink to="/admin/billing" className={navClass}>
              <span>▭</span>
              Billing
            </NavLink>
          )}

          <button className={styles.navItem}>
            <span>◫</span>
            Analytics
          </button>
          
          <button className={styles.navItem}>
            <span>⚙</span>
            Settings
          </button>
        </nav>
        
        <div className={styles.sidebarBottom}>
          <div className={styles.adminUser}>
            <div className={styles.avatar}>
              {user.name
            ?.substring(0, 2)
            .toUpperCase()}
            </div>
            <div>
              <strong>
                {user.name}
              </strong>
              <span>
                {storeRoleLabel(user.role)}
              </span>
            </div>
          </div>
          <button className={styles.logoutButton} onClick={() => {
            logout();
            window.location.href =
                "/admin/login";
        }}>
            ↪ Logout
          </button>
        </div>
      </aside>
      
      <div className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className={styles.headerLabel}>
              ADMINISTRATION
            </span>
            <h1>
              {isSuperAdmin
            ? "Dashboard"
            : "My Store"}
            </h1>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.iconButton}>
              ♢
            </button>
            <div className={styles.headerAvatar}>
              {user.name
            ?.substring(0, 2)
            .toUpperCase()}
            </div>
          </div>
        </header>
        {billingBanner && (
          <div
            className={`${styles.billingBanner} ${styles[`billingBanner_${billingBanner.tone}`]}`}
            role={billingBanner.tone === "info" ? "status" : "alert"}
          >
            <span>{billingBanner.message}</span>
            <Link to={billingPagePath} className={styles.billingBannerLink}>
              {billingBanner.linkLabel}
            </Link>
          </div>
        )}
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>);
}
