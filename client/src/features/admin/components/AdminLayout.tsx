import { NavLink, Outlet, Navigate, useLocation, } from "react-router-dom";
import { useAuth } from "../../auth/hooks/useAuth";
import styles from "../styles/AdminLayout.module.css";
export default function AdminLayout() {
    const location = useLocation();
    const { user, isAuthenticated, logout } = useAuth();
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
    const pathname = location.pathname;
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
            <h2>OmniStore</h2>
            <span>
              Admin Portal
            </span>
          </div>
        </div>
        <nav className={styles.navigation}>
          
          {isSuperAdmin && (<NavLink to="/admin" end className={({ isActive }) => `${styles.navItem} ${isActive
                ? styles.active
                : ""}`}>
              <span>▦</span>
              Dashboard
            </NavLink>)}
          
          {isSuperAdmin && (<NavLink to="/admin/tenants" className={({ isActive }) => `${styles.navItem} ${isActive
                ? styles.active
                : ""}`}>
              <span>◉</span>
              Tenants
            </NavLink>)}
          
          {isAdmin &&
            user.tenantId && (<NavLink to={`/admin/tenants/${user.tenantId}/orders`} className={({ isActive }) => `${styles.navItem} ${isActive
                ? styles.active
                : ""}`}>
                <span>⧉</span>
                Orders
            </NavLink>)}
          
          {isAdmin &&
            user.tenantId && (<NavLink to={`/admin/tenants/${user.tenantId}`} className={({ isActive }) => `${styles.navItem} ${isActive
                ? styles.active
                : ""}`}>
                <span>◉</span>
                My Store
              </NavLink>)}
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
