import {
  NavLink,
  Outlet,
  Navigate,
  useLocation,
} from "react-router-dom";
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
  // ==================================================
  // GET AUTH
  // ==================================================
  const storedAuth =
    localStorage.getItem("ecommerce_auth");
  // ==================================================
  // NOT LOGGED IN
  // ==================================================
  if (!storedAuth) {
    return (
      <Navigate
        to="/admin/login"
        replace
        state={{
          from: location.pathname,
        }}
      />
    );
  }
  // ==================================================
  // PARSE AUTH
  // ==================================================
  let auth: AuthData;
  try {
    auth = JSON.parse(storedAuth);
  } catch {
    localStorage.removeItem(
      "ecommerce_auth",
    );
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }
  const user = auth?.user;
  // ==================================================
  // USER NOT FOUND
  // ==================================================
  if (!user) {
    localStorage.removeItem(
      "ecommerce_auth",
    );
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }
  // ==================================================
  // ROLES
  // ==================================================
  const isSuperAdmin =
    user.role === "super_admin";
  const isAdmin =
    user.role === "admin";
  // ==================================================
  // ONLY ADMIN / SUPER ADMIN
  // ==================================================
  if (!isSuperAdmin && !isAdmin) {
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }
  // ==================================================
  // SUPER ADMIN VALIDATION
  // ==================================================
  if (
    isSuperAdmin &&
    user.tenantId !== null
  ) {
    localStorage.removeItem(
      "ecommerce_auth",
    );
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }
  // ==================================================
  // TENANT ADMIN VALIDATION
  // ==================================================
  if (
    isAdmin &&
    !user.tenantId
  ) {
    localStorage.removeItem(
      "ecommerce_auth",
    );
    return (
      <Navigate
        to="/admin/login"
        replace
      />
    );
  }
  // ==================================================
  // CURRENT PATH
  // ==================================================
  const pathname = location.pathname;
  // ==================================================
  // ADMIN CANNOT ACCESS SUPER ADMIN DASHBOARD
  //
  // /admin
  // ==================================================
  if (
    isAdmin &&
    pathname === "/admin"
  ) {
    return (
      <Navigate
        to={`/admin/tenants/${user.tenantId}`}
        replace
      />
    );
  }
  // ==================================================
  // ADMIN CANNOT ACCESS TENANTS LIST
  //
  // /admin/tenants
  // /admin/tenants/create
  // ==================================================
  if (
    isAdmin &&
    (
      pathname === "/admin/tenants" ||
      pathname === "/admin/tenants/"
    )
  ) {
    return (
      <Navigate
        to={`/admin/tenants/${user.tenantId}`}
        replace
      />
    );
  }
  if (
    isAdmin &&
    pathname === "/admin/tenants/create"
  ) {
    return (
      <Navigate
        to={`/admin/tenants/${user.tenantId}`}
        replace
      />
    );
  }
  // ==================================================
  // ADMIN CAN ONLY ACCESS HIS OWN TENANT
  //
  // Example:
  //
  // logged in tenant = shopsphere
  //
  // allowed:
  // /admin/tenants/shopsphere
  //
  // blocked:
  // /admin/tenants/fashionhub
  // ==================================================
  if (isAdmin) {
    const tenantPrefix =
      "/admin/tenants/";
    if (
      pathname.startsWith(
        tenantPrefix,
      )
    ) {
      const remainingPath =
        pathname.substring(
          tenantPrefix.length,
        );
      const requestedTenantId =
        remainingPath.split("/")[0];
      if (
        requestedTenantId &&
        requestedTenantId !==
          user.tenantId
      ) {
        return (
          <Navigate
            to={`/admin/tenants/${user.tenantId}`}
            replace
          />
        );
      }
    }
  }
  // ==================================================
  // RENDER ADMIN PORTAL
  // ==================================================
  return (
    <div className={styles.layout}>
      {/* SIDEBAR */}
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
        <nav
          className={styles.navigation}
        >
          {/* ======================================
              SUPER ADMIN DASHBOARD
          ====================================== */}
          {isSuperAdmin && (
            <NavLink
              to="/admin"
              end
              className={({ isActive }) =>
                `${styles.navItem} ${
                  isActive
                    ? styles.active
                    : ""
                }`
              }
            >
              <span>▦</span>
              Dashboard
            </NavLink>
          )}
          {/* ======================================
              SUPER ADMIN TENANTS
          ====================================== */}
          {isSuperAdmin && (
            <NavLink
              to="/admin/tenants"
              className={({ isActive }) =>
                `${styles.navItem} ${
                  isActive
                    ? styles.active
                    : ""
                }`
              }
            >
              <span>◉</span>
              Tenants
            </NavLink>
          )}
          {/* ======================================
              TENANT ADMIN STORE
          ====================================== */}
          {isAdmin &&
            user.tenantId && (
              <NavLink
                to={`/admin/tenants/${user.tenantId}`}
                className={({ isActive }) =>
                  `${styles.navItem} ${
                    isActive
                      ? styles.active
                      : ""
                  }`
                }
              >
                <span>◉</span>
                My Store
              </NavLink>
            )}
          <div
            className={
              styles.sectionTitle
            }
          >
            PLATFORM
          </div>
          {/* ======================================
              ANALYTICS
          ====================================== */}
          <button
            className={styles.navItem}
          >
            <span>◫</span>
            Analytics
          </button>
          {/* ======================================
              SETTINGS
          ====================================== */}
          <button
            className={styles.navItem}
          >
            <span>⚙</span>
            Settings
          </button>
        </nav>
        {/* ========================================
            SIDEBAR BOTTOM
        ======================================== */}
        <div
          className={
            styles.sidebarBottom
          }
        >
          <div
            className={
              styles.adminUser
            }
          >
            <div
              className={styles.avatar}
            >
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
          <button
            className={
              styles.logoutButton
            }
            onClick={() => {
              localStorage.removeItem(
                "ecommerce_auth",
              );
              window.location.href =
                "/admin/login";
            }}
          >
            ↪ Logout
          </button>
        </div>
      </aside>
      {/* ==========================================
          MAIN
      ========================================== */}
      <div className={styles.main}>
        <header
          className={styles.header}
        >
          <div>
            <span
              className={
                styles.headerLabel
              }
            >
              ADMINISTRATION
            </span>
            <h1>
              {isSuperAdmin
                ? "Dashboard"
                : "My Store"}
            </h1>
          </div>
          <div
            className={
              styles.headerRight
            }
          >
            <button
              className={
                styles.iconButton
              }
            >
              ♢
            </button>
            <div
              className={
                styles.headerAvatar
              }
            >
              {user.name
                ?.substring(0, 2)
                .toUpperCase()}
            </div>
          </div>
        </header>
        <main
          className={styles.content}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
