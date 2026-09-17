import { NavLink, Outlet, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import { usePageSeo } from "../../seo";
import { useTenantByTenantId } from "../hooks/useTenants";
import { isMenuBusiness, isRetailBusiness } from "../../tenant/businessMode";
import { routes, storefrontNavigate } from "../../../routes/routes";
import styles from "../styles/AdminLayout.module.css";

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
        user?.role === "admin"
            ? user.tenantId || ""
            : tenantIdFromAdminPath(pathname);
    const { data: storeTenant } = useTenantByTenantId(storeTenantId);
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
    const isAdmin = user.role === "admin";
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
    return (<div className={styles.layout}>
      
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            O
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

          {showStoreNav && (
            <NavLink to={`/admin/tenants/${storeTenantId}/products`} className={navClass}>
              <span>◫</span>
              Products
            </NavLink>
          )}

          {showStoreNav && showRetailExtras && (
            <NavLink to={`/admin/tenants/${storeTenantId}/orders`} className={navClass}>
              <span>⧉</span>
              Orders
            </NavLink>
          )}

          {showStoreNav && showMenuDesk && (
            <NavLink to={`/admin/tenants/${storeTenantId}/menu`} className={navClass}>
              <span>▤</span>
              Menu Desk
            </NavLink>
          )}

          {showStoreNav && (
            <NavLink to={`/admin/tenants/${storeTenantId}/customers`} className={navClass}>
              <span>◎</span>
              Customers
            </NavLink>
          )}

          {showStoreNav && showBanners && (
            <NavLink to={`/admin/tenants/${storeTenantId}/banners`} className={navClass}>
              <span>▣</span>
              Banners
            </NavLink>
          )}

          {showStoreNav && showRetailExtras && (
            <NavLink to={`/admin/tenants/${storeTenantId}/shipping/delhivery`} className={navClass}>
              <span>⬡</span>
              Shipping
            </NavLink>
          )}

          {showStoreNav && (
            <NavLink to={`/admin/tenants/${storeTenantId}/integrations/periskope`} className={navClass}>
              <span>◌</span>
              WhatsApp
            </NavLink>
          )}

          {showStoreNav && storeTenant?.slug && (
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

          {showStoreNav && (
            <NavLink to={`/admin/tenants/${storeTenantId}/edit`} className={navClass}>
              <span>✎</span>
              Edit Tenant
            </NavLink>
          )}
          <div className={styles.sectionTitle}>
            PLATFORM
          </div>
          
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
                {isSuperAdmin
            ? "Super Admin"
            : "Tenant Admin"}
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
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>);
}
