import  { useState, useEffect, useRef } from 'react';
import styles from '../../styles/Navbar.module.css';

const NAV_LINKS = ['Electronics', 'Accessories', 'Home Decor', 'Lighting'];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const menuRef = useRef(null);

  // Lock body scroll while the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Close on Escape key
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className={styles.navbar}>
      <div className={styles.container}>
        {/* Logo */}
        <a href="/" className={styles.logo}>
          <span className={styles.logoIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M12 3a9 9 0 1 0 9 9c0-.34-.02-.67-.05-1A7 7 0 0 1 12 3z"
                fill="currentColor"
              />
            </svg>
          </span>
          <span className={styles.logoText}>Lunar Tech</span>
        </a>

        {/* Desktop nav links */}
        <nav className={styles.navLinks} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link} href={`/${link.toLowerCase().replace(/\s+/g, '-')}`} className={styles.navLink}>
              {link}
            </a>
          ))}
        </nav>

        {/* Right section */}
        <div className={styles.rightSection}>
          {/* Full search bar — desktop only */}
          <div className={styles.searchWrapper}>
            <SearchIcon className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search products, brands..."
              className={styles.searchInput}
              aria-label="Search products, brands"
            />
          </div>

          {/* Search icon-only trigger — tablet & mobile */}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSearchOpen((o) => !o)}
            aria-label="Toggle search"
          >
            <SearchIcon className={styles.searchIcon} />
          </button>

          <button type="button" className={styles.iconButton} aria-label="Wishlist">
            <HeartIcon />
            <span className={styles.badge}>2</span>
          </button>

          <button type="button" className={styles.iconButton} aria-label="Cart">
            <CartIcon />
            <span className={styles.badge}>3</span>
          </button>

          <div className={styles.avatar} aria-label="Account" role="img" />

          {/* Hamburger — tablet & mobile only */}
          <button
            type="button"
            className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ''}`}
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Collapsible search row — tablet & mobile */}
      <div className={`${styles.searchRow} ${searchOpen ? styles.searchRowOpen : ''}`}>
        <SearchIcon className={styles.searchIcon} />
        <input
          type="text"
          placeholder="Search products, brands..."
          className={styles.searchInput}
          aria-label="Search products, brands"
        />
      </div>

      {/* Overlay */}
      <div
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ''}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      {/* Slide-in mobile menu */}
      <aside
        ref={menuRef}
        className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ''}`}
        aria-label="Mobile menu"
      >
        <div className={styles.mobileMenuHeader}>
          <span className={styles.logoText}>Menu</span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>
        <nav className={styles.mobileNavLinks} aria-label="Mobile primary">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link}
              href={`/${link.toLowerCase().replace(/\s+/g, '-')}`}
              className={styles.mobileNavLink}
              style={{ transitionDelay: menuOpen ? `${80 + i * 60}ms` : '0ms' }}
              onClick={() => setMenuOpen(false)}
            >
              {link}
            </a>
          ))}
        </nav>
      </aside>
    </header>
  );
}

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <path
        d="M12 20s-7-4.35-9.5-8.5C.7 8 2 4.5 5.5 4c2-.3 3.7.7 4.5 2.1C10.8 4.7 12.5 3.7 14.5 4c3.5.5 4.8 4 3 7.5C19 15.65 12 20 12 20z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
      <circle cx="9" cy="20" r="1.4" fill="currentColor" />
      <circle cx="18" cy="20" r="1.4" fill="currentColor" />
      <path
        d="M2 3h2.2l2.2 12.2a2 2 0 0 0 2 1.6h8.3a2 2 0 0 0 2-1.6L21 7H5.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}