import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import styles from "../../styles/navBar.module.css";
import { ShoppingCart } from "lucide-react";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";

const NAV_LINKS = [
  {
    label: "Electronics",
    categoryId: "ELECTRONICS",
  },
  {
    label: "Accessories",
    categoryId: "ACCESSORIES",
  },
  {
    label: "Home Decor",
    categoryId: "HOME_DECOR",
  },
  {
    label: "Lighting",
    categoryId: "LIGHTING",
  },
];

export default function Navbar() {
  const userId = "6a4c664aad39d00258ffc0ba";
  const tenantId = "TENANT001";

  const { cartCount } = useCart(userId, tenantId);
  const { wishlistCount } = useWishlist(userId, tenantId);
  console.log("Cart Count in Navbar:", cartCount);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");

  const menuRef = useRef<HTMLElement | null>(null);

  const navigate = useNavigate();
  const { tenantSlug } = useParams();

  /* ============================================================
     BODY SCROLL
  ============================================================ */

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  /* ============================================================
     ESCAPE KEY
  ============================================================ */

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  /* ============================================================
     SEARCH
  ============================================================ */

  const handleSearch = () => {
    const search = searchValue.trim();

    if (!search) {
      return;
    }

    navigate(`/${tenantSlug}/products?search=${encodeURIComponent(search)}`);

    setSearchOpen(false);
    setMenuOpen(false);
  };

  /* ============================================================
     CATEGORY NAVIGATION
  ============================================================ */

  const handleCategoryClick = (categoryId: string) => {
    navigate(
      `/${tenantSlug}/products?category=${encodeURIComponent(categoryId)}`
    );

    setMenuOpen(false);
    setSearchOpen(false);
  };

  /* ============================================================
     HOME
  ============================================================ */

  const handleHome = () => {
    navigate(`/${tenantSlug}`);

    setMenuOpen(false);
    setSearchOpen(false);
  };

  /* ============================================================
     RENDER
  ============================================================ */

  return (
    <header className={styles.navbar}>
      <div className={styles.container}>
        {/* =====================================================
            LOGO
        ===================================================== */}

        <button
          type="button"
          className={styles.logo}
          onClick={handleHome}
          aria-label="Go to home"
        >
          <span className={styles.logoIcon}>LT</span>

          <span className={styles.logoText}>Lunar Tech</span>
        </button>

        {/* =====================================================
            DESKTOP NAVIGATION
        ===================================================== */}

        <nav className={styles.navLinks} aria-label="Primary navigation">
          {NAV_LINKS.map((link) => (
            <button
              key={link.categoryId}
              type="button"
              className={styles.navLink}
              onClick={() => handleCategoryClick(link.categoryId)}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* =====================================================
            RIGHT SECTION
        ===================================================== */}

        <div className={styles.rightSection}>
          {/* =================================================
              DESKTOP SEARCH
          ================================================= */}

          <div className={styles.searchWrapper}>
            <SearchIcon className={styles.searchIcon} />

            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="Search products, brands..."
              className={styles.searchInput}
              aria-label="Search products, brands"
            />

            <button
              type="button"
              className={styles.searchButton}
              onClick={handleSearch}
              aria-label="Search"
            >
              <SearchIcon />
            </button>
          </div>

          {/* =================================================
              TABLET / MOBILE SEARCH ICON
          ================================================= */}

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSearchOpen((open) => !open)}
            aria-label="Toggle search"
            aria-expanded={searchOpen}
          >
            <SearchIcon />
          </button>

          {/* =================================================
              WISHLIST
          ================================================= */}

          <button
            type="button"
            className={styles.iconButton}
            aria-label="Wishlist"
            onClick={() => {
              navigate(`/${tenantSlug}/wishlist`);
            }}
          >
            <HeartIcon />

            {wishlistCount > 0 && (
              <span className={styles.badge}>{wishlistCount}</span>
            )}
          </button>

          {/* =================================================
              CART
          ================================================= */}
          <button type="button" className={styles.iconButton} aria-label="Cart">
            <ShoppingCart size={20} />

            {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </button>

          {/* =================================================
              AVATAR
          ================================================= */}

          <button
            type="button"
            className={styles.avatar}
            aria-label="Account"
            onClick={() => {
              navigate(`/${tenantSlug}/profile`);
            }}
          />

          {/* =================================================
              HAMBURGER
          ================================================= */}

          <button
            type="button"
            className={`${styles.menuButton} ${
              menuOpen ? styles.menuButtonOpen : ""
            }`}
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* ======================================================
          TABLET / MOBILE SEARCH
      ====================================================== */}

      <div
        className={`${styles.searchRow} ${
          searchOpen ? styles.searchRowOpen : ""
        }`}
      >
        <SearchIcon className={styles.searchIcon} />

        <input
          type="text"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="Search products, brands..."
          className={styles.searchInput}
          aria-label="Search products, brands"
        />

        <button
          type="button"
          className={styles.searchButton}
          onClick={handleSearch}
          aria-label="Search"
        >
          <SearchIcon />
        </button>
      </div>

      {/* ======================================================
          OVERLAY
      ====================================================== */}

      <div
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      {/* ======================================================
          MOBILE MENU
      ====================================================== */}

      <aside
        ref={menuRef}
        className={`${styles.mobileMenu} ${
          menuOpen ? styles.mobileMenuOpen : ""
        }`}
        aria-label="Mobile menu"
        aria-hidden={!menuOpen}
      >
        {/* ==================================================
            MENU HEADER
        ================================================== */}

        <div className={styles.mobileMenuHeader}>
          <div className={styles.mobileMenuTitle}>
            <span className={styles.mobileMenuLogo}>LT</span>

            <span className={styles.mobileMenuText}>Menu</span>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <XIcon />
          </button>
        </div>

        {/* ==================================================
            MENU LINKS
        ================================================== */}

        <nav className={styles.mobileNavLinks} aria-label="Mobile navigation">
          {NAV_LINKS.map((link, index) => (
            <button
              key={link.categoryId}
              type="button"
              className={styles.mobileNavLink}
              style={{
                transitionDelay: menuOpen ? `${80 + index * 60}ms` : "0ms",
              }}
              onClick={() => handleCategoryClick(link.categoryId)}
            >
              <span>{link.label}</span>

              <ChevronIcon />
            </button>
          ))}
        </nav>

        {/* ==================================================
            MOBILE MENU FOOTER
        ================================================== */}

        <div className={styles.mobileMenuFooter}>
          <button
            type="button"
            onClick={() => {
              navigate(`/${tenantSlug}/wishlist`);
              setMenuOpen(false);
            }}
          >
            Wishlist
          </button>

          <button
            type="button"
            onClick={() => {
              navigate(`/${tenantSlug}/cart`);
              setMenuOpen(false);
            }}
          >
            Cart
          </button>

          <button
            type="button"
            onClick={() => {
              navigate(`/${tenantSlug}/profile`);
              setMenuOpen(false);
            }}
          >
            Account
          </button>
        </div>
      </aside>
    </header>
  );
}

/* ============================================================
   SEARCH ICON
============================================================ */

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

/* ============================================================
   HEART ICON
============================================================ */

function HeartIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.8 8.6c0 5.4-8.8 10.4-8.8 10.4S3.2 14 3.2 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z" />
    </svg>
  );
}

/* ============================================================
   CLOSE ICON
============================================================ */

function XIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/* ============================================================
   CHEVRON ICON
============================================================ */

function ChevronIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
