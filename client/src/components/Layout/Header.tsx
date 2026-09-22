import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShoppingCart, Palette } from "lucide-react";
import styles from "../../styles/NavBar.module.css";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useNavigateToLogin } from "../../features/auth/hooks/useNavigateToLogin";
import { useCategory } from "../../features/products/hooks/useCategory";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import { useCanManageStoreLayout } from "../../features/auth/useCanManageStoreLayout";
import { routes, storefrontNavigate, withQuery } from "../../routes/routes";
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
    const navigateToLogin = useNavigateToLogin();
    const { tenantSlug, tenantId: catalogTenantId, tenant } = useStorefrontTenant();
    const { user, isAuthenticated } = useAuth();
    const go = (to: string) => storefrontNavigate(navigate, to);
    const layoutSettings = useLayoutSettings();
    const canManageLayout = useCanManageStoreLayout();
    const { data: categoryResponse, isLoading: categoriesLoading } = useCategory(catalogTenantId);
    const isCustomer = isAuthenticated && user?.role === "customer" && Boolean(user._id);
    const cartUserId = isCustomer ? user!._id : "";
    const cartTenantId = isCustomer ? (user!.tenantId || catalogTenantId || "") : "";
    const { cartCount } = useCart(cartUserId, cartTenantId);
    const { wishlistCount } = useWishlist(cartUserId, cartTenantId);
    const [menuOpen, setMenuOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const [logoFailed, setLogoFailed] = useState(false);
    const [visibleCount, setVisibleCount] = useState(0);
    const navRef = useRef<HTMLElement | null>(null);
    const measureRef = useRef<HTMLDivElement | null>(null);
    const moreRef = useRef<HTMLDivElement | null>(null);
    const logoSrc = (tenant?.logo || "").trim();
    const showStoreLogo = Boolean(logoSrc) && !logoFailed;
    const categories: Category[] = categoryResponse?.data || [];
    const visibleCategories = categories.slice(0, visibleCount);
    const overflowCategories = categories.slice(visibleCount);
    useEffect(() => {
        setLogoFailed(false);
    }, [logoSrc]);
    useLayoutEffect(() => {
        const nav = navRef.current;
        const measure = measureRef.current;
        if (!nav || !measure || !layoutSettings.showHeaderCategories) {
            setVisibleCount(categories.length);
            return;
        }
        const update = () => {
            const items = Array.from(measure.querySelectorAll("[data-nav-item]")) as HTMLElement[];
            const moreEl = measure.querySelector("[data-nav-more]") as HTMLElement | null;
            const available = nav.clientWidth;
            const gap = Number.parseFloat(getComputedStyle(measure).columnGap || getComputedStyle(measure).gap) || 16;
            const moreWidth = moreEl?.offsetWidth || 72;
            const widths = items.map((item) => item.offsetWidth);
            let used = 0;
            let fit = 0;
            for (let index = 0; index < widths.length; index += 1) {
                const nextUsed = used + (fit > 0 ? gap : 0) + widths[index];
                const remaining = widths.length - index - 1;
                const limit = remaining > 0 ? available - gap - moreWidth : available;
                if (nextUsed <= limit + 1) {
                    used = nextUsed;
                    fit += 1;
                } else {
                    break;
                }
            }
            setVisibleCount(fit);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(nav);
        window.addEventListener("resize", update);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", update);
        };
    }, [categories, layoutSettings.showHeaderCategories, tenantSlug]);
    const handleSearch = () => {
        const search = searchValue.trim();
        if (!search || !tenantSlug) {
            return;
        }
        go(withQuery(routes.products(tenantSlug), { search }));
        setSearchOpen(false);
        setMenuOpen(false);
        setMoreOpen(false);
    };
    const handleCategoryClick = (category: Category) => {
        if (!tenantSlug) {
            return;
        }
        const categoryId = category.categoryId ||
            category._id ||
            category.slug ||
            category.name;
        go(withQuery(routes.products(tenantSlug), { categoryIds: categoryId }));
        setMenuOpen(false);
        setSearchOpen(false);
        setMoreOpen(false);
    };
    const handleHome = () => {
        if (!tenantSlug) {
            return;
        }
        go(routes.home(tenantSlug));
        setMenuOpen(false);
        setSearchOpen(false);
        setMoreOpen(false);
    };
    useEffect(() => {
        document.body.style.overflow = menuOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [menuOpen]);
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setMenuOpen(false);
                setSearchOpen(false);
                setMoreOpen(false);
            }
        };
        const handlePointerDown = (event: PointerEvent) => {
            if (moreRef.current && !moreRef.current.contains(event.target as Node)) {
                setMoreOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("pointerdown", handlePointerDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("pointerdown", handlePointerDown);
        };
    }, []);
    const headerLayoutClass = [
        styles.container,
        layoutSettings.headerLogoPosition === "center" ? styles.logoCenter : styles.logoLeft,
        layoutSettings.headerSearchPosition === "center"
            ? styles.searchCenter
            : layoutSettings.headerSearchPosition === "after-logo"
                ? styles.searchAfterLogo
                : styles.searchRight,
        layoutSettings.showHeaderCategories
            ? layoutSettings.headerNavAlignment === "center"
                ? styles.navAlignCenter
                : styles.navAlignLeft
            : styles.navHidden,
    ].join(" ");
    const searchPosition = layoutSettings.headerSearchPosition;
    const renderDesktopSearch = (slotClassName?: string) => {
        if (!layoutSettings.showHeaderSearch) {
            return null;
        }
        return (<div className={`${styles.searchWrapper} ${slotClassName || ""}`}>
            <SearchIcon className={styles.searchIcon}/>
            <input type="text" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
                handleSearch();
            }
        }} placeholder="Search products, brands..." className={styles.searchInput}/>
            <button type="button" className={styles.searchButton} onClick={handleSearch}>
              <SearchIcon />
            </button>
          </div>);
    };
    return (<header className={`${styles.navbar} ${layoutSettings.stickyHeader ? styles.navbarSticky : styles.navbarStatic}`}>
      <div className={headerLayoutClass}>
        
        <button type="button" className={styles.logo} onClick={handleHome} aria-label="Home">
          {showStoreLogo ? (
            <img
              className={styles.logoImage}
              src={logoSrc}
              alt=""
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <>
              <span className={styles.logoIcon}>{getInitials(tenantSlug)}</span>
              <span className={styles.logoText}>{tenantSlug.toUpperCase()}</span>
            </>
          )}
        </button>
        
        {searchPosition === "after-logo" && renderDesktopSearch(styles.searchSlotInline)}

        {layoutSettings.showHeaderCategories && (<nav ref={navRef} className={styles.navLinks} aria-label="Primary navigation">
          <div ref={measureRef} className={styles.navMeasure} aria-hidden="true">
            {categories.map((category, index) => (
              <span key={`${category._id || category.categoryId || category.slug || category.name}-measure-${index}`} data-nav-item className={styles.navLink}>
                {category.name}
              </span>
            ))}
            <span data-nav-more className={styles.navLink}>More</span>
          </div>
          {categoriesLoading ? (<span className={styles.navLink}>Loading...</span>) : (<>
            {visibleCategories.map((category, index) => {
            const key = `${category._id || category.categoryId || category.slug || category.name}-${index}`;
            return (<button key={key} type="button" className={styles.navLink} onClick={() => handleCategoryClick(category)}>
                  {category.name}
                </button>);
            })}
            {overflowCategories.length > 0 && (
              <div ref={moreRef} className={styles.moreWrap}>
                <button
                  type="button"
                  className={`${styles.navLink} ${styles.moreButton} ${moreOpen ? styles.moreButtonOpen : ""}`}
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                  onClick={() => setMoreOpen((open) => !open)}
                >
                  More
                </button>
                {moreOpen && (
                  <div className={styles.moreMenu} role="menu">
                    {overflowCategories.map((category, index) => (
                      <button
                        key={`${category._id || category.categoryId || category.slug || category.name}-more-${index}`}
                        type="button"
                        role="menuitem"
                        className={styles.moreItem}
                        onClick={() => handleCategoryClick(category)}
                      >
                        {category.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>)}
        </nav>)}
        
        {searchPosition === "center" && renderDesktopSearch(styles.searchSlotCenter)}

        <div className={styles.rightSection}>
          
          {searchPosition === "right" && renderDesktopSearch()}
          
          {layoutSettings.showHeaderSearch && (<button type="button" className={styles.iconButton} onClick={() => setSearchOpen((value) => !value)}>
            <SearchIcon />
          </button>)}
          
          {canManageLayout && (<button
            type="button"
            className={styles.iconButton}
            onClick={() => go(routes.customize(tenantSlug!))}
            aria-label="Open layout studio"
            title="Layout studio"
          >
            <Palette size={20} />
          </button>)}

          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              if (!isCustomer) {
                navigateToLogin(undefined, () => go(routes.wishlist(tenantSlug!)));
                return;
              }
              go(routes.wishlist(tenantSlug!));
            }}
            aria-label="Wishlist"
          >
            <HeartIcon />
            {wishlistCount > 0 && (<span className={styles.badge}>{wishlistCount}</span>)}
          </button>
          
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              if (!isCustomer) {
                navigateToLogin(undefined, () => go(routes.cart(tenantSlug!)));
                return;
              }
              go(routes.cart(tenantSlug!));
            }}
            aria-label="Cart"
          >
            <ShoppingCart size={20}/>
            {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </button>
          
          {user ? (<button type="button" className={styles.avatar} onClick={() => go(routes.profile(tenantSlug!))} aria-label="Account">
              {getInitials(user?.name)}
            </button>) : (<button type="button" className={styles.avatar} onClick={() => navigateToLogin()} aria-label="Sign in">
              UK
            </button>)}
          
          <button type="button" className={`${styles.menuButton} ${menuOpen ? styles.menuButtonOpen : ""}`} onClick={() => setMenuOpen((value) => !value)} aria-label="Open menu" aria-expanded={menuOpen}>
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>
      
      <div className={`${styles.searchRow} ${searchOpen ? styles.searchRowOpen : ""}`}>
        <SearchIcon className={styles.searchIcon}/>
        <input type="text" value={searchValue} onChange={(event) => setSearchValue(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
                handleSearch();
            }
        }} placeholder="Search products, brands..." className={styles.searchInput}/>
        <button type="button" className={styles.searchButton} onClick={handleSearch}>
          <SearchIcon />
        </button>
      </div>
      
      <div className={`${styles.overlay} ${menuOpen ? styles.overlayVisible : ""}`} onClick={() => setMenuOpen(false)}/>
      
      <aside className={`${styles.mobileMenu} ${menuOpen ? styles.mobileMenuOpen : ""}`}>
        <div className={styles.mobileMenuHeader}>
          <div className={styles.mobileMenuTitle}>
            {showStoreLogo ? (
              <img className={styles.mobileMenuLogoImage} src={logoSrc} alt="" />
            ) : (
              <span className={styles.mobileMenuLogo}>LT</span>
            )}
            <span className={styles.mobileMenuText}>Menu</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={() => setMenuOpen(false)}>
            <XIcon />
          </button>
        </div>
        
        <nav className={styles.mobileNavLinks}>
          {categoryResponse?.data?.map((category: Category) => (<button key={category._id ||
                    category.categoryId ||
                    category.slug ||
                    category.name} type="button" className={styles.mobileNavLink} onClick={() => handleCategoryClick(category)}>
                <span>{category.name}</span>
                <ChevronIcon />
              </button>))}
        </nav>
        
        <div className={styles.mobileMenuFooter}>
          {canManageLayout && (<button type="button" onClick={() => {
            go(routes.customize(tenantSlug!));
            setMenuOpen(false);
        }}>
            Layout studio
          </button>)}
          <button type="button" aria-label="Mobile wishlist" onClick={() => {
            if (!isCustomer) {
                navigateToLogin(undefined, () => go(routes.wishlist(tenantSlug!)));
            }
            else {
                go(routes.wishlist(tenantSlug!));
            }
            setMenuOpen(false);
        }}>
            Wishlist
          </button>
          <button type="button" aria-label="Mobile cart" onClick={() => {
            if (!isCustomer) {
                navigateToLogin(undefined, () => go(routes.cart(tenantSlug!)));
            }
            else {
                go(routes.cart(tenantSlug!));
            }
            setMenuOpen(false);
        }}>
            Cart
          </button>
          <button type="button" aria-label={isCustomer ? "Mobile account" : "Mobile sign in"} onClick={() => {
            if (isCustomer) {
                go(routes.profile(tenantSlug!));
            }
            else {
                navigateToLogin();
            }
            setMenuOpen(false);
        }}>
            {isCustomer ? "Account" : "Sign in"}
          </button>
        </div>
      </aside>
    </header>);
}
function SearchIcon({ className = "" }: {
    className?: string;
}) {
    return (<svg className={className} width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <path d="m20 20-4-4"/>
    </svg>);
}
function HeartIcon() {
    return (<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 8.6c0 5.4-8.8 10.4-8.8 10.4S3.2 14 3.2 8.6A4.6 4.6 0 0 1 12 6.1a4.6 4.6 0 0 1 8.8 2.5Z"/>
    </svg>);
}
function XIcon() {
    return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18"/>
      <path d="m6 6 12 12"/>
    </svg>);
}
function ChevronIcon() {
    return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>);
}
