import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./navBar.module.css";

const NavBar = () => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <>
      <header
        className={`${styles.header} ${scrolled ? styles.scrolled : ""}`}
      >
        <div className={styles.headerContainer}>
          <nav className={styles.navMenu}>
            <Link to="/" onClick={closeMenu}>Home</Link>
            <Link to="/men" onClick={closeMenu}>Men</Link>
            <Link to="/women" onClick={closeMenu}>Women</Link>
            <Link to="/kids" onClick={closeMenu}>Kids</Link>
          </nav>

          <div className={styles.logo}>Logo</div>

          <nav className={styles.navMenu}>
            <Link to="/profile" onClick={closeMenu}>Profile</Link>
            <Link to="/wishlist" onClick={closeMenu}>Wishlist</Link>
            <Link to="/cart" onClick={closeMenu}>Cart</Link>
          </nav>

          <button
            className={`${styles.hamburger} ${
              mobileMenuOpen ? styles.open : ""
            }`}
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle Menu"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <nav
        className={`${styles.mobileMenu} ${
          mobileMenuOpen ? styles.mobileOpen : ""
        }`}
      >
        <Link to="/" onClick={closeMenu}>Home</Link>
        <Link to="/men" onClick={closeMenu}>Men</Link>
        <Link to="/women" onClick={closeMenu}>Women</Link>
        <Link to="/kids" onClick={closeMenu}>Kids</Link>
        <Link to="/profile" onClick={closeMenu}>Profile</Link>
        <Link to="/wishlist" onClick={closeMenu}>Wishlist</Link>
        <Link to="/cart" onClick={closeMenu}>Cart</Link>
      </nav>
    </>
  );
};

export default NavBar;