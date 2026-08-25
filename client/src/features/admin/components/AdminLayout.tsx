import { NavLink, Outlet, Navigate, useLocation, } from "react-router-dom";
import styles from "../styles/AdminLayout.module.css";
interface AuthUser {
    userId: string;
    name: string;
    email: string;
    tenantId: string | null;
    role: string;
}
interface AuthData {
    user: AuthUser;
    accessToken: string;
}
export default function AdminLayout() {
    const location = useLocation();
    const storedAuth = localStorage.getItem("ecommerce_auth");
    if (!storedAuth) {
        return (<Navigate to="/admin/login" replace state={{
                from: location.pathname,
            }}/>);
    }
    let auth: AuthData;
    try {
        auth = JSON.parse(storedAuth);
    }
    catch {
        localStorage.removeItem("ecommerce_auth");
        return (<Navigate to="/admin/login" replace/>);
    }
    const user = auth?.user;
    if (!user) {
        localStorage.removeItem("ecommerce_auth");
        return (<Navigate to="/admin/login" replace/>);
    }
    const isSuperAdmin = user.role === "super_admin";
    const isAdmin = user.role === "admin";
    if (!isSuperAdmin && !isAdmin) {
        return (<Navigate to="/admin/login" replace/>);
    }
    if (isSuperAdmin &&
        user.tenantId !== null) {
        localStorage.removeItem("ecommerce_auth");
        return (<Navigate to="/admin/login" replace/>);
    }
    if (isAdmin &&
        !user.tenantId) {
        localStorage.removeItem("ecommerce_auth");
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
            localStorage.removeItem("ecommerce_auth");
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
