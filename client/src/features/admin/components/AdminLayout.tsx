import { NavLink, Outlet } from "react-router-dom";
import styles from "../styles/AdminLayout.module.css";

export default function AdminLayout() {
  return (
    <div className={styles.layout}>
      {/* SIDEBAR */}
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>O</div>

          <div>
            <h2>OmniStore</h2>
            <span>Admin Portal</span>
          </div>
        </div>

        <nav className={styles.navigation}>
          <NavLink
            to="/admin"
            end
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ""}`
            }
          >
            <span>▦</span>
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/tenants"
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ""}`
            }
          >
            <span>◉</span>
            Tenants
          </NavLink>

          <div className={styles.sectionTitle}>PLATFORM</div>

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
            <div className={styles.avatar}>SA</div>

            <div>
              <strong>Super Admin</strong>
              <span>Administrator</span>
            </div>
          </div>

          <button className={styles.logoutButton}>↪ Logout</button>
        </div>
      </aside>

      {/* MAIN */}
      <div className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className={styles.headerLabel}>ADMINISTRATION</span>
            <h1>Dashboard</h1>
          </div>

          <div className={styles.headerRight}>
            <button className={styles.iconButton}>♢</button>

            <div className={styles.headerAvatar}>SA</div>
          </div>
        </header>

        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
