import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import styles from "./ProductsPage.module.css";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { clearFilters, setCatalogFilter, setFilters } from "../../features/products/productSlice";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import Breadcrumb from "../../components/Breadcrumb";
import ProductFilters from "../../components/ProductFilters";
import ProductGrid from "../../components/ProductGrid";
import FilterDrawer from "../../components/FilterDrawer";
import SortDropdown from "../../components/SortDropdown";
import AppliedFilters from "../../components/ProductFilters/AppliedFilters";
import { useProducts } from "../../features/products/hooks/useProducts";
import { useDebounce } from "../../hooks/useDebounce";
const DEFAULT_MIN_PRICE = 0;
const DEFAULT_MAX_PRICE = 100000;
const Products = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const dispatch = useAppDispatch();
    const { tenantSlug, tenantId } = useStorefrontTenant();
    const filters = useAppSelector((state) => state.products.filters);
    const storedCatalogFilter = useAppSelector(
        (state) => state.products.catalogFilter,
    );
    const [drawerOpen, setDrawerOpen] = useState(false);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const debouncedPriceRange = useDebounce(filters.priceRange, 400);
    const urlSearch = searchParams.get("search") ?? "";
    const urlSortBy = searchParams.get("sortBy") ?? "createdAt";
    const urlSortOrder = searchParams.get("sortOrder") ?? "desc";
    const urlCategoryIds = searchParams.getAll("categoryIds");
    const singleCategory = searchParams.get("category");
    const urlCategories = urlCategoryIds.length > 0
        ? urlCategoryIds
        : singleCategory
            ? [singleCategory]
            : [];
    const urlColors = searchParams.getAll("colors");
    const urlSizes = searchParams.getAll("sizes");
    const urlBrands = searchParams.getAll("brands");
    const urlMinPrice = searchParams.get("minPrice");
    const urlMaxPrice = searchParams.get("maxPrice");
    const urlRating = searchParams.get("rating");
    useEffect(() => {
        const minPrice = urlMinPrice ? Number(urlMinPrice) : DEFAULT_MIN_PRICE;
        const maxPrice = urlMaxPrice ? Number(urlMaxPrice) : DEFAULT_MAX_PRICE;
        const ratingValue = urlRating !== null ? Number(urlRating) : null;
        dispatch(setFilters({
            categories: urlCategories,
            colors: urlColors,
            sizes: urlSizes,
            brands: urlBrands,
            priceRange: [
                Number.isFinite(minPrice) ? minPrice : DEFAULT_MIN_PRICE,
                Number.isFinite(maxPrice) ? maxPrice : DEFAULT_MAX_PRICE,
            ],
            rating: ratingValue !== null && Number.isFinite(ratingValue)
                ? ratingValue
                : null,
            search: urlSearch,
            sort: urlSortBy === "price" && urlSortOrder === "asc"
                ? "priceAsc"
                : urlSortBy === "price" && urlSortOrder === "desc"
                    ? "priceDesc"
                    : urlSortBy === "rating"
                        ? "rating"
                        : urlSortBy === "discount"
                            ? "discount"
                            : "newest",
        }));
    }, [
        dispatch,
        urlSearch,
        urlSortBy,
        urlSortOrder,
        urlMinPrice,
        urlMaxPrice,
        urlRating,
        searchParams.toString(),
    ]);
    const sort = useMemo(() => {
        if (urlSortBy === "price" && urlSortOrder === "asc") {
            return "priceAsc";
        }
        if (urlSortBy === "price" && urlSortOrder === "desc") {
            return "priceDesc";
        }
        if (urlSortBy === "rating") {
            return "rating";
        }
        if (urlSortBy === "discount") {
            return "discount";
        }
        return "newest";
    }, [urlSortBy, urlSortOrder]);
    const updateUrl = (updates: Record<string, string | string[] | number | null | undefined>) => {
        const params = new URLSearchParams(searchParams);
        Object.entries(updates).forEach(([key, value]) => {
            params.delete(key);
            if (value === undefined || value === null || value === "") {
                return;
            }
            if (Array.isArray(value)) {
                value.forEach((item) => {
                    params.append(key, String(item));
                });
                return;
            }
            params.set(key, String(value));
        });
        params.set("page", "1");
        setSearchParams(params);
    };
    const categoryIds = urlCategories.length > 0
        ? urlCategories
        : filters.categories.length > 0
            ? filters.categories
            : undefined;
    const search = urlSearch.trim() || undefined;
    const catalogPriceMin = storedCatalogFilter?.price.min;
    const catalogPriceMax = storedCatalogFilter?.price.max;
    const productsQuery = useProducts({
        tenantId,
        limit: 20,
        categoryIds,
        colors: urlColors.length > 0
            ? urlColors
            : filters.colors.length > 0
                ? filters.colors
                : undefined,
        sizes: urlSizes.length > 0
            ? urlSizes
            : filters.sizes.length > 0
                ? filters.sizes
                : undefined,
        brands: urlBrands.length > 0
            ? urlBrands
            : filters.brands.length > 0
                ? filters.brands
                : undefined,
        minPrice:
            catalogPriceMin !== undefined &&
            debouncedPriceRange[0] > catalogPriceMin
                ? debouncedPriceRange[0]
                : debouncedPriceRange[0] !== DEFAULT_MIN_PRICE
                    ? debouncedPriceRange[0]
                    : undefined,
        maxPrice:
            catalogPriceMax !== undefined &&
            debouncedPriceRange[1] < catalogPriceMax
                ? debouncedPriceRange[1]
                : debouncedPriceRange[1] !== DEFAULT_MAX_PRICE
                    ? debouncedPriceRange[1]
                    : undefined,
        rating: filters.rating !== null ? filters.rating : undefined,
        search,
        sortBy: urlSortBy as "createdAt" | "price" | "rating" | "discount" | "name",
        sortOrder: urlSortOrder as "asc" | "desc",
    });
    const products = productsQuery.data?.pages.flatMap((page) => page.data) ?? [];
    const totalCount = productsQuery.data?.pages[0]?.totalCount ?? 0;
    const catalogFilter = productsQuery.data?.pages[0]?.filter;
    useEffect(() => {
        if (!catalogFilter) {
            return;
        }
        dispatch(setCatalogFilter(catalogFilter));
        const isUnsetPrice =
            filters.priceRange[0] === DEFAULT_MIN_PRICE &&
            filters.priceRange[1] === DEFAULT_MAX_PRICE;
        if (isUnsetPrice && catalogFilter.price) {
            dispatch(
                setFilters({
                    priceRange: [
                        catalogFilter.price.min,
                        Math.max(catalogFilter.price.max, catalogFilter.price.min),
                    ],
                }),
            );
        }
    }, [catalogFilter, dispatch]);
    const handleSortChange = (value: string) => {
        switch (value) {
            case "priceAsc":
                updateUrl({
                    sortBy: "price",
                    sortOrder: "asc",
                });
                break;
            case "priceDesc":
                updateUrl({
                    sortBy: "price",
                    sortOrder: "desc",
                });
                break;
            case "rating":
                updateUrl({
                    sortBy: "rating",
                    sortOrder: "desc",
                });
                break;
            case "discount":
                updateUrl({
                    sortBy: "discount",
                    sortOrder: "desc",
                });
                break;
            default:
                updateUrl({
                    sortBy: "createdAt",
                    sortOrder: "desc",
                });
                break;
        }
    };
    const previousFilters = useRef(filters);
    useEffect(() => {
        const previous = previousFilters.current;
        const filtersChanged = JSON.stringify(previous) !== JSON.stringify(filters);
        if (!filtersChanged) {
            return;
        }
        previousFilters.current = filters;
        const params = new URLSearchParams(searchParams);
        params.delete("categoryIds");
        params.delete("category");
        filters.categories.forEach((category) => {
            params.append("categoryIds", category);
        });
        params.delete("colors");
        filters.colors.forEach((color) => {
            params.append("colors", color);
        });
        params.delete("sizes");
        filters.sizes.forEach((size) => {
            params.append("sizes", size);
        });
        params.delete("brands");
        filters.brands.forEach((brand) => {
            params.append("brands", brand);
        });
        params.delete("minPrice");
        params.delete("maxPrice");
        if (filters.priceRange[0] !== DEFAULT_MIN_PRICE) {
            params.set("minPrice", String(filters.priceRange[0]));
        }
        if (filters.priceRange[1] !== DEFAULT_MAX_PRICE) {
            params.set("maxPrice", String(filters.priceRange[1]));
        }
        params.delete("rating");
        if (filters.rating !== null) {
            params.set("rating", String(filters.rating));
        }
        if (filters.search) {
            params.set("search", filters.search);
        }
        params.set("page", "1");
        setSearchParams(params);
    }, [filters]);
    useEffect(() => {
        const element = loadMoreRef.current;
        if (!element) {
            return;
        }
        const observer = new IntersectionObserver((entries) => {
            const firstEntry = entries[0];
            if (firstEntry.isIntersecting &&
                productsQuery.hasNextPage &&
                !productsQuery.isFetchingNextPage) {
                productsQuery.fetchNextPage();
            }
        }, {
            rootMargin: "300px",
        });
        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, [
        productsQuery.hasNextPage,
        productsQuery.isFetchingNextPage,
        productsQuery.fetchNextPage,
    ]);
    useEffect(() => {
        document.body.style.overflow = drawerOpen ? "hidden" : "";
        return () => {
            document.body.style.overflow = "";
        };
    }, [drawerOpen]);
    const clearSearch = () => {
        const params = new URLSearchParams(searchParams);
        params.delete("search");
        params.set("page", "1");
        dispatch(setFilters({
            search: "",
        }));
        setSearchParams(params);
    };
    const clearAll = () => {
        dispatch(clearFilters());
        const params = new URLSearchParams();
        setSearchParams(params);
    };
    if (productsQuery.isLoading) {
        return (<div className={styles.page}>
        <Breadcrumb items={[
                {
                    label: "Home",
                    href: `/${tenantSlug}`,
                },
                {
                    label: "Products",
                },
            ]}/>
        <div className={styles.header}>
          <div>
            <h1>Products</h1>
            <p>Loading products...</p>
          </div>
        </div>
        <div className={styles.loadingGrid}>
          {Array.from({
                length: 8,
            }).map((_, index) => (<div key={index} className={styles.skeletonCard}>
              <div className={styles.skeletonImage}/>
              <div className={styles.skeletonLine}/>
              <div className={styles.skeletonLineShort}/>
              <div className={styles.skeletonPrice}/>
            </div>))}
        </div>
      </div>);
    }
    if (productsQuery.isError) {
        return (<div className={styles.page}>
        <Breadcrumb items={[
                {
                    label: "Home",
                    href: `/${tenantSlug}`,
                },
                {
                    label: "Products",
                },
            ]}/>
        <div className={styles.errorState}>
          <h2>Something went wrong</h2>
          <p>We couldn't load the products. Please try again.</p>
          <button type="button" onClick={() => productsQuery.refetch()}>
            Try Again
          </button>
        </div>
      </div>);
    }
    const hasSearch = Boolean(urlSearch.trim());
    const hasCategory = urlCategories.length > 0;
    const pageTitle = hasSearch
        ? `Search results for "${urlSearch}"`
        : hasCategory
            ? urlCategories.join(", ")
            : "Products";
    return (<div className={styles.page}>
      <Breadcrumb items={[
            {
                label: "Home",
                href: `/${tenantSlug}`,
            },
            {
                label: pageTitle,
            },
        ]}/>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <div className={styles.titleRow}>
            <h1>{pageTitle}</h1>
            {hasSearch && (<button type="button" className={styles.clearSearchButton} onClick={clearSearch} aria-label="Clear search">
                <X size={16}/>
              </button>)}
          </div>
          <p>
            {totalCount} {totalCount === 1 ? "Product" : "Products"} Found
          </p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.filterBtn} onClick={() => setDrawerOpen(true)}>
            <Filter size={18}/>
            Filters
          </button>
          <SortDropdown value={sort} onChange={handleSortChange}/>
        </div>
      </div>
      {hasSearch && (<div className={styles.searchInfo}>
          <Search size={16}/>
          <span>
            Showing results for <strong>"{urlSearch}"</strong>
          </span>
          <button type="button" onClick={clearSearch}>
            Clear
          </button>
        </div>)}
      <AppliedFilters />
      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <ProductFilters />
        </aside>
        <main className={styles.products}>
          {products.length === 0 ? (<div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Search size={28}/>
              </div>
              <h2>No products found</h2>
              <p>
                {hasSearch
                ? `We couldn't find any products matching "${urlSearch}".`
                : "We couldn't find any products matching your current filters."}
              </p>
              <button type="button" className={styles.clearFiltersButton} onClick={clearAll}>
                Clear Filters
              </button>
            </div>) : (<>
              <ProductGrid products={products}/>
              <div ref={loadMoreRef} className={styles.loadMore}>
                {productsQuery.isFetchingNextPage && (<div className={styles.loadingMore}>
                    Loading more products...
                  </div>)}
                {!productsQuery.hasNextPage && products.length > 0 && (<div className={styles.noMore}>No more products</div>)}
              </div>
            </>)}
        </main>
      </div>
      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ProductFilters />
      </FilterDrawer>
    </div>);
};
export default Products;
