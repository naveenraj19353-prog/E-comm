import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import styles from "../../styles/navBar.module.css";
import { useCart } from "../../features/cart/hooks/useCart";
import { useWishlist } from "../../features/wishlist/hooks/useWishlist";
import { useAuth } from "../../features/auth/hooks/useAuth";
import { useCategory } from "../../features/products/hooks/useCategory";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
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
    const catalogTenantId = useStorefrontTenant().tenantId;
    const { data: categoryResponse, isLoading: categoriesLoading } = useCategory(catalogTenantId);
    const { cartCount } = useCart(user?._id as string, user?.tenantId as string);
    const { wishlistCount } = useWishlist(user?._id as string, user?.tenantId as string);
    const [categoryStart, setCategoryStart] = useState(0);
    const [menuOpen, setMenuOpen] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchValue, setSearchValue] = useState("");
    const categories: Category[] = categoryResponse?.data
        ? categoryResponse.data.slice(0, 5)
        : [];
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
    let visibleCategories = categories.slice(categoryStart, categoryStart + 3);
    if (visibleCategories.length < 3 && categories.length > 3) {
        visibleCategories = [
            ...visibleCategories,
            ...categories.slice(0, 3 - visibleCategories.length),
        ];
    }
    const handleSearch = () => {
        const search = searchValue.trim();
        if (!search || !tenantSlug) {
            return;
        }
        navigate(`/${tenantSlug}/products?search=${encodeURIComponent(search)}`);
        setSearchOpen(false);
        setMenuOpen(false);
    };
    const handleCategoryClick = (category: Category) => {
        if (!tenantSlug) {
            return;
        }
        const categoryId = category.categoryId || category.slug || category.name;
        navigate(`/${tenantSlug}/products?category=${encodeURIComponent(categoryId)}`);
        setMenuOpen(false);
        setSearchOpen(false);
    };
    const handleHome = () => {
        if (!tenantSlug) {
            return;
        }
        navigate(`/${tenantSlug}`);
        setMenuOpen(false);
        setSearchOpen(false);
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
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);
    return (<header className={styles.navbar}>
      <div className={styles.container}>
        
        <button type="button" className={styles.logo} onClick={handleHome}>
          <span className={styles.logoIcon}>LT</span>
          <span className={styles.logoText}>Lunar Tech</span>
        </button>
        
        <nav className={styles.navLinks} aria-label="Primary navigation">
          {categoriesLoading ? (<span className={styles.navLink}>Loading...</span>) : (visibleCategories.map((category) => {
            const key = category._id ||
                category.categoryId ||
                category.slug ||
                category.name;
            return (<button key={key} type="button" className={styles.navLink} onClick={() => handleCategoryClick(category)}>
                  {category.name}
                </button>);
        }))}
        </nav>
        
        <div className={styles.rightSection}>
          
          <div className={styles.searchWrapper}>
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
          
          <button type="button" className={styles.iconButton} onClick={() => setSearchOpen((value) => !value)}>
            <SearchIcon />
          </button>
          
          <button type="button" className={styles.iconButton} onClick={() => navigate(`/${tenantSlug}/wishlist`)}>
            <HeartIcon />
            {wishlistCount > 0 && (<span className={styles.badge}>{wishlistCount}</span>)}
          </button>
          
          <button type="button" className={styles.iconButton} onClick={() => navigate(`/${tenantSlug}/cart`)}>
            <ShoppingCart size={20}/>
            {cartCount > 0 && <span className={styles.badge}>{cartCount}</span>}
          </button>
          
          {user ? (<button type="button" className={styles.avatar} onClick={() => navigate(`/${tenantSlug}/profile`)}>
              {getInitials(user?.name)}
            </button>) : (<button type="button" className={styles.avatar} onClick={() => navigate(`/${tenantSlug}/login`)}>
              UK
            </button>)}
          
          <button type="button" className={styles.menuButton} onClick={() => setMenuOpen((value) => !value)}>
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
            <span className={styles.mobileMenuLogo}>LT</span>
            <span className={styles.mobileMenuText}>Menu</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={() => setMenuOpen(false)}>
            <XIcon />
          </button>
        </div>
        
        <nav className={styles.mobileNavLinks}>
          {categoryResponse &&
            categoryResponse.data.map((category: Category) => (<button key={category._id ||
                    category.categoryId ||
                    category.slug ||
                    category.name} type="button" className={styles.mobileNavLink} onClick={() => handleCategoryClick(category)}>
                <span>{category.name}</span>
                <ChevronIcon />
              </button>))}
        </nav>
        
        <div className={styles.mobileMenuFooter}>
          <button type="button" onClick={() => {
            navigate(`/${tenantSlug}/wishlist`);
            setMenuOpen(false);
        }}>
            Wishlist
          </button>
          <button type="button" onClick={() => {
            navigate(`/${tenantSlug}/cart`);
            setMenuOpen(false);
        }}>
            Cart
          </button>
          <button type="button" onClick={() => {
            navigate(user
                ? `/${tenantSlug}/profile`
                : `/${tenantSlug}/login`);
            setMenuOpen(false);
        }}>
            {user ? "Account" : "Sign in"}
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
