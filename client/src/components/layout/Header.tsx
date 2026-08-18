import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShoppingCart } from "lucide-react";

import styles from "../../styles/navBar.module.css";

import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useCategory } from "../../features/products/hooks/useCategory";

interface Category {
  _id?: string;
  categoryId?: string;
  name: string;
  slug?: string;
}

const getInitials = (name?: string) => {
  if (!name?.trim()) {
    return "NA";
  }

  const parts = name.trim().split(/\s+/);

  return ((parts[0]?.[0] || "N") + (parts[1]?.[0] || "A")).toUpperCase();
};

export default function Navbar() {
  const navigate = useNavigate();

  const { tenantSlug } = useParams<{
    tenantSlug: string;
  }>();

  const { user } = useAuth();

  const tenantId = tenantSlug || "";

  /*
   * ================================
   * CATEGORY API
   * ================================
   */
  const { data: categoryResponse, isLoading: categoriesLoading } =
    useCategory(tenantId);

  /*
   * ================================
   * CART
   * ================================
   */

  const { cartCount } = useCart(user?._id as string, user?.tenantId as string);

  /*
   * ================================
   * WISHLIST
   * ================================
   */

  const { wishlistCount } = useWishlist(
    user?._id as string,
    user?.tenantId as string,
  );

  const [categoryStart, setCategoryStart] = useState(0);

  const [menuOpen, setMenuOpen] = useState(false);

  const [searchOpen, setSearchOpen] = useState(false);

  const [searchValue, setSearchValue] = useState("");

  /*
   * ================================
   * GET CATEGORIES
   * ================================
   */

  const categories: Category[] = categoryResponse?.data
    ? categoryResponse.data.slice(0, 5)
    : [];

  /*
   * ================================
   * SLIDE 3 CATEGORIES
   * EVERY 3 SECONDS
   * ================================
   */

  useEffect(() => {
    if (categories.length <= 3) {
      return;
    }

    const interval = window.setInterval(() => {
      setCategoryStart((current) => {
        const next = current + 3;

        return next >= categories.length ? 0 : next;
      });
    }, 3000);

    return () => {
      window.clearInterval(interval);
    };
  }, [categories.length]);
  /*
   * ================================
   * VISIBLE 3 CATEGORIES
   * ================================
   */

  let visibleCategories = categories.slice(categoryStart, categoryStart + 3);

  /*
   * If only 1 or 2 are remaining,
   * fill from beginning.
   */

  if (visibleCategories.length < 3 && categories.length > 3) {
    visibleCategories = [
      ...visibleCategories,
      ...categories.slice(0, 3 - visibleCategories.length),
    ];
  }

  /*
   * ================================
   * SEARCH
   * ================================
   */

  const handleSearch = () => {
    const search = searchValue.trim();

    if (!search || !tenantSlug) {
      return;
    }

    navigate(`/${tenantSlug}/products?search=${encodeURIComponent(search)}`);

    setSearchOpen(false);
    setMenuOpen(false);
  };

  /*
   * ================================
   * CATEGORY CLICK
   * ================================
   */

  const handleCategoryClick = (category: Category) => {
    if (!tenantSlug) {
      return;
    }

    const categoryId = category.categoryId || category.slug || category.name;

    navigate(
      `/${tenantSlug}/products?category=${encodeURIComponent(categoryId)}`,
    );

    setMenuOpen(false);
    setSearchOpen(false);
  };

  /*
   * ================================
   * HOME
   * ================================
   */

  const handleHome = () => {
    if (!tenantSlug) {
      return;
    }

    navigate(`/${tenantSlug}`);

    setMenuOpen(false);
    setSearchOpen(false);
  };

  /*
   * ================================
   * MENU BODY
   * ================================
   */

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  /*
   * ================================
   * ESCAPE
   * ================================
   */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSearchOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className={styles.navbar}>
      <div className={styles.container}>
        {/* ================================
            LOGO
        ================================= */}

        <button type="button" className={styles.logo} onClick={handleHome}>
          <span className={styles.logoIcon}>LT</span>

          <span className={styles.logoText}>Lunar Tech</span>
        </button>

        {/* ================================
            DESKTOP CATEGORY NAV
        ================================= */}

        <nav className={styles.navLinks} aria-label="Primary navigation">
          {categoriesLoading ? (
            <span className={styles.navLink}>Loading...</span>
          ) : (
            visibleCategories.map((category) => {
              const key =
                category._id ||
                category.categoryId ||
                category.slug ||
                category.name;

              return (
                <button
                  key={key}
                  type="button"
                  className={styles.navLink}
                  onClick={() => handleCategoryClick(category)}
                >
                  {category.name}
                </button>
              );
            })
          )}
        </nav>

        {/* ================================
            RIGHT SECTION
        ================================= */}

        <div className={styles.rightSection}>
          {/* SEARCH */}

          <div className={styles.searchWrapper}>
            <SearchIcon className={styles.searchIcon} />

            <input
              type="text"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleSearch();
                }
              }}
              placeholder="Search products, brands..."
              className={styles.searchInput}
            />

            <button
              type="button"
              className={styles.searchButton}
              onClick={handleSearch}
            >
              <SearchIcon />
            </button>
          </div>

          {/* MOBILE SEARCH */}

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setSearchOpen((value) => !value)}
          >
            <SearchIcon />
          </button>

          {/* WISHLIST */}

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => navigate(`/${tenantSlug}/wishlist`)}
          >
            <HeartIcon />

            {wishlistCount > 0 && (
              <span className={styles.badge}>{wishlistCount}</span>
            )}
          </button>

          {/* CART */}

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => navigate(`/${tenantSlug}/cart`)}
          >
            <ShoppingCart size={20} />

            {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </button>

          {/* PROFILE */}

          <button
            type="button"
            className={styles.avatar}
            onClick={() => navigate(`/${tenantSlug}/profile`)}
          >
            {getInitials(user?.name)}
          </button>

          {/* MOBILE MENU */}

          <button
            type="button"
            className={styles.menuButton}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* ================================
          MOBILE SEARCH
      ================================= */}

      <div
        className={`${styles.searchRow} ${
          searchOpen ? styles.searchRowOpen : ""
        }`}
      >
        <SearchIcon className={styles.searchIcon} />

        <input
          type="text"
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              handleSearch();
            }
          }}
          placeholder="Search products, brands..."
          className={styles.searchInput}
        />

        <button
          type="button"
          className={styles.searchButton}
          onClick={handleSearch}
        >
          <SearchIcon />
        </button>
      </div>

      {/* ================================
          OVERLAY
      ================================= */}

      <div
        className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`}
        onClick={() => setMenuOpen(false)}
      />

      {/* ================================
          MOBILE MENU
      ================================= */}

      <aside
        className={`${styles.mobileMenu} ${
          menuOpen ? styles.mobileMenuOpen : ""
        }`}
      >
        <div className={styles.mobileMenuHeader}>
          <div className={styles.mobileMenuTitle}>
            <span className={styles.mobileMenuLogo}>LT</span>

            <span className={styles.mobileMenuText}>Menu</span>
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={() => setMenuOpen(false)}
          >
            <XIcon />
          </button>
        </div>

        {/* MOBILE CATEGORIES */}

        <nav className={styles.mobileNavLinks}>
          {categoryResponse &&
            categoryResponse.data.map((category: Category) => (
              <button
                key={
                  category._id ||
                  category.categoryId ||
                  category.slug ||
                  category.name
                }
                type="button"
                className={styles.mobileNavLink}
                onClick={() => handleCategoryClick(category)}
              >
                <span>{category.name}</span>

                <ChevronIcon />
              </button>
            ))}
        </nav>

        {/* MOBILE FOOTER */}

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

/* ============================================
   ICONS
============================================ */

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
    >
      <circle cx="11" cy="11" r="7" />

      <path d="m20 20-4-4" />
    </svg>
  );
}

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
    >
      <path d="M20.8 8.6c0 5.4-8.8 10.4-8.8 10.4S3.2 14 3.2 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z" />
    </svg>
  );
}

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
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

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
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
