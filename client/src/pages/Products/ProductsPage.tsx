import { useEffect, useMemo, useRef, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import styles from "./ProductsPage.module.css";

import { useAppDispatch, useAppSelector } from "../../app/hooks";

import { clearFilters, setFilters } from "../../features/products/productSlice";

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

  const filters = useAppSelector((state) => state.products.filters);

  const tenantId =
    useAppSelector((state) => state.tenant.currentTenant?.id) || "TENANT001";

  const [drawerOpen, setDrawerOpen] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const debouncedPriceRange = useDebounce(filters.priceRange, 400);

  /* =========================================================
     READ URL
  ========================================================= */

  const urlSearch = searchParams.get("search") ?? "";

  const urlSortBy = searchParams.get("sortBy") ?? "createdAt";

  const urlSortOrder = searchParams.get("sortOrder") ?? "desc";

  // const urlPage = Number(searchParams.get("page") ?? "1") || 1;

  const urlCategories = searchParams.getAll("categoryIds");

  const urlColors = searchParams.getAll("colors");

  const urlSizes = searchParams.getAll("sizes");

  const urlMinPrice = searchParams.get("minPrice");

  const urlMaxPrice = searchParams.get("maxPrice");

  const urlRating = searchParams.get("rating");

  /* =========================================================
     SYNC URL -> REDUX
     
     URL is the source of truth when page loads.
  ========================================================= */

  useEffect(() => {
    const minPrice = urlMinPrice ? Number(urlMinPrice) : DEFAULT_MIN_PRICE;

    const maxPrice = urlMaxPrice ? Number(urlMaxPrice) : DEFAULT_MAX_PRICE;

    const ratingValue = urlRating !== null ? Number(urlRating) : null;

    dispatch(
      setFilters({
        categories: urlCategories,
        colors: urlColors,
        sizes: urlSizes,
        priceRange: [
          Number.isFinite(minPrice) ? minPrice : DEFAULT_MIN_PRICE,

          Number.isFinite(maxPrice) ? maxPrice : DEFAULT_MAX_PRICE,
        ],
        rating:
          ratingValue !== null && Number.isFinite(ratingValue)
            ? ratingValue
            : null,
        search: urlSearch,
        sort:
          urlSortBy === "price" && urlSortOrder === "asc"
            ? "priceAsc"
            : urlSortBy === "price" && urlSortOrder === "desc"
            ? "priceDesc"
            : urlSortBy === "rating"
            ? "rating"
            : urlSortBy === "discount"
            ? "discount"
            : "newest",
      })
    );
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

  /* =========================================================
     SORT
  ========================================================= */

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

  /* =========================================================
     UPDATE URL HELPER
  ========================================================= */

  const updateUrl = (
    updates: Record<string, string | string[] | number | null | undefined>
  ) => {
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

  /* =========================================================
     CATEGORY
  ========================================================= */

  const categoryIds =
    urlCategories.length > 0
      ? urlCategories
      : filters.categories.length > 0
      ? filters.categories
      : undefined;

  /* =========================================================
     SEARCH
  ========================================================= */

  const search = urlSearch.trim() || undefined;

  /* =========================================================
     PRODUCTS API
     
     FastAPI API remains unchanged.
  ========================================================= */

  const productsQuery = useProducts({
    tenantId:"TENANT001",

    limit: 20,

    categoryIds,

    colors:
      urlColors.length > 0
        ? urlColors
        : filters.colors.length > 0
        ? filters.colors
        : undefined,

    sizes:
      urlSizes.length > 0
        ? urlSizes
        : filters.sizes.length > 0
        ? filters.sizes
        : undefined,

    minPrice:
      debouncedPriceRange[0] !== DEFAULT_MIN_PRICE
        ? debouncedPriceRange[0]
        : undefined,

    maxPrice:
      debouncedPriceRange[1] !== DEFAULT_MAX_PRICE
        ? debouncedPriceRange[1]
        : undefined,

    rating: filters.rating !== null ? filters.rating : undefined,

    search,

    sortBy: urlSortBy as "createdAt" | "price" | "rating" | "discount" | "name",

    sortOrder: urlSortOrder as "asc" | "desc",
  });

  /* =========================================================
     PRODUCTS
  ========================================================= */

  const products = productsQuery.data?.pages.flatMap((page) => page.data) ?? [];

  const totalCount = productsQuery.data?.pages[0]?.totalCount ?? 0;

  /* =========================================================
     SORT CHANGE
  ========================================================= */

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

  /* =========================================================
     SYNC REDUX FILTER CHANGES -> URL
     
     This detects sidebar changes.
  ========================================================= */

  const previousFilters = useRef(filters);

  useEffect(() => {
    const previous = previousFilters.current;

    const filtersChanged = JSON.stringify(previous) !== JSON.stringify(filters);

    if (!filtersChanged) {
      return;
    }

    previousFilters.current = filters;

    const params = new URLSearchParams(searchParams);

    /* -------------------------
       Categories
    ------------------------- */

    params.delete("categoryIds");

    filters.categories.forEach((category) => {
      params.append("categoryIds", category);
    });

    /* -------------------------
       Colors
    ------------------------- */

    params.delete("colors");

    filters.colors.forEach((color) => {
      params.append("colors", color);
    });

    /* -------------------------
       Sizes
    ------------------------- */

    params.delete("sizes");

    filters.sizes.forEach((size) => {
      params.append("sizes", size);
    });

    /* -------------------------
       Price
    ------------------------- */

    params.delete("minPrice");
    params.delete("maxPrice");

    if (filters.priceRange[0] !== DEFAULT_MIN_PRICE) {
      params.set("minPrice", String(filters.priceRange[0]));
    }

    if (filters.priceRange[1] !== DEFAULT_MAX_PRICE) {
      params.set("maxPrice", String(filters.priceRange[1]));
    }

    /* -------------------------
       Rating
    ------------------------- */

    params.delete("rating");

    if (filters.rating !== null) {
      params.set("rating", String(filters.rating));
    }

    /* -------------------------
       Search
       
       Search is already managed
       by URL.
    ------------------------- */

    if (filters.search) {
      params.set("search", filters.search);
    }

    params.set("page", "1");

    setSearchParams(params);
  }, [filters]);

  /* =========================================================
     INFINITE SCROLL
  ========================================================= */

  useEffect(() => {
    const element = loadMoreRef.current;

    if (!element) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];

        if (
          firstEntry.isIntersecting &&
          productsQuery.hasNextPage &&
          !productsQuery.isFetchingNextPage
        ) {
          productsQuery.fetchNextPage();
        }
      },
      {
        rootMargin: "300px",
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [
    productsQuery.hasNextPage,
    productsQuery.isFetchingNextPage,
    productsQuery.fetchNextPage,
  ]);

  /* =========================================================
     BODY SCROLL LOCK
  ========================================================= */

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [drawerOpen]);

  /* =========================================================
     CLEAR SEARCH
  ========================================================= */

  const clearSearch = () => {
    const params = new URLSearchParams(searchParams);

    params.delete("search");

    params.set("page", "1");

    dispatch(
      setFilters({
        search: "",
      })
    );

    setSearchParams(params);
  };

  /* =========================================================
     CLEAR ALL
  ========================================================= */

  const clearAll = () => {
    dispatch(clearFilters());

    const params = new URLSearchParams();

    setSearchParams(params);
  };

  /* =========================================================
     LOADING
  ========================================================= */

  if (productsQuery.isLoading) {
    return (
      <div className={styles.page}>
        <Breadcrumb
          items={[
            {
              label: "Home",
              href: `/${tenantId}`,
            },
            {
              label: "Products",
            },
          ]}
        />

        <div className={styles.header}>
          <div>
            <h1>Products</h1>
            <p>Loading products...</p>
          </div>
        </div>

        <div className={styles.loadingGrid}>
          {Array.from({
            length: 8,
          }).map((_, index) => (
            <div key={index} className={styles.skeletonCard}>
              <div className={styles.skeletonImage} />

              <div className={styles.skeletonLine} />

              <div className={styles.skeletonLineShort} />

              <div className={styles.skeletonPrice} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* =========================================================
     ERROR
  ========================================================= */

  if (productsQuery.isError) {
    return (
      <div className={styles.page}>
        <Breadcrumb
          items={[
            {
              label: "Home",
              href: `/${tenantId}`,
            },
            {
              label: "Products",
            },
          ]}
        />

        <div className={styles.errorState}>
          <h2>Something went wrong</h2>

          <p>We couldn't load the products. Please try again.</p>

          <button type="button" onClick={() => productsQuery.refetch()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  /* =========================================================
     PAGE TITLE
  ========================================================= */

  const hasSearch = Boolean(urlSearch.trim());

  const hasCategory = urlCategories.length > 0;

  const pageTitle = hasSearch
    ? `Search results for "${urlSearch}"`
    : hasCategory
    ? urlCategories.join(", ")
    : "Products";

  /* =========================================================
     PAGE
  ========================================================= */

  return (
    <div className={styles.page}>
      <Breadcrumb
        items={[
          {
            label: "Home",
            href: `/${tenantId}`,
          },
          {
            label: pageTitle,
          },
        ]}
      />

      {/* HEADER */}

      <div className={styles.header}>
        <div className={styles.titleSection}>
          <div className={styles.titleRow}>
            <h1>{pageTitle}</h1>

            {hasSearch && (
              <button
                type="button"
                className={styles.clearSearchButton}
                onClick={clearSearch}
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <p>
            {totalCount} {totalCount === 1 ? "Product" : "Products"} Found
          </p>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.filterBtn}
            onClick={() => setDrawerOpen(true)}
          >
            <Filter size={18} />
            Filters
          </button>

          <SortDropdown value={sort} onChange={handleSortChange} />
        </div>
      </div>

      {/* SEARCH INFO */}

      {hasSearch && (
        <div className={styles.searchInfo}>
          <Search size={16} />

          <span>
            Showing results for <strong>"{urlSearch}"</strong>
          </span>

          <button type="button" onClick={clearSearch}>
            Clear
          </button>
        </div>
      )}

      {/* APPLIED FILTERS */}

      <AppliedFilters />

      {/* CONTENT */}

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <ProductFilters />
        </aside>

        <main className={styles.products}>
          {products.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <Search size={28} />
              </div>

              <h2>No products found</h2>

              <p>
                {hasSearch
                  ? `We couldn't find any products matching "${urlSearch}".`
                  : "We couldn't find any products matching your current filters."}
              </p>

              <button
                type="button"
                className={styles.clearFiltersButton}
                onClick={clearAll}
              >
                Clear Filters
              </button>
            </div>
          ) : (
            <>
              <ProductGrid products={products} />

              <div ref={loadMoreRef} className={styles.loadMore}>
                {productsQuery.isFetchingNextPage && (
                  <div className={styles.loadingMore}>
                    Loading more products...
                  </div>
                )}

                {!productsQuery.hasNextPage && products.length > 0 && (
                  <div className={styles.noMore}>No more products</div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* MOBILE FILTER DRAWER */}

      <FilterDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <ProductFilters />
      </FilterDrawer>
    </div>
  );
};

export default Products;
