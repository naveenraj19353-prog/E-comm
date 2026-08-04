import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import {
    Heart,
    ShoppingCart,
    User,
    Menu,
} from "lucide-react";

import styles from "./Navbar.module.css";
import { navItems } from "./navItems";
import MobileDrawer from "./MobileDrawer";
import SearchBar from "./SearchBar";

const Navbar = () => {
    const [menuOpen, setMenuOpen] = useState(false);
    const [isScrolled, setIsScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 10);
        };

        window.addEventListener("scroll", handleScroll);

        return () =>
            window.removeEventListener("scroll", handleScroll);
    }, []);

    return (
        <>
            <header
                className={`${styles.navbar} ${isScrolled ? styles.scrolled : ""
                    }`}
            >
                {/* Left */}
                <div className={styles.leftSection}>
                    <button
                        className={styles.menuButton}
                        onClick={() => setMenuOpen(true)}
                    >
                        <Menu size={24} />
                    </button>

                    <Link to="/" className={styles.logo}>
                        Lunar Tech
                    </Link>

                    <nav className={styles.navLinks}>
                        {navItems.map((item) => (
                            <NavLink
                            to={item.path}
                            className={({ isActive }) =>
                              isActive
                                ? `${styles.navLink} ${styles.active}`
                                : styles.navLink
                            }
                          >
                            {item.label}
                          </NavLink>
                        ))}
                    </nav>
                </div>

                {/* Center */}
                <div className={styles.searchContainer}>
                    <SearchBar />
                </div>

                {/* Right */}
                <div className={styles.rightSection}>
                    <button className={styles.iconButton}>
                        <Heart size={22} />
                        <span className={styles.badge}>3</span>
                    </button>

                    <button className={styles.iconButton}>
                        <ShoppingCart size={22} />
                        <span className={styles.badge}>2</span>
                    </button>

                    <button className={styles.avatar}>
                        <User size={22} />
                    </button>
                </div>
            </header>

            <MobileDrawer
                open={menuOpen}
                onClose={() => setMenuOpen(false)}
            />
        </>
    );
};

export default Navbar;