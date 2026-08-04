import { useEffect, useMemo, useState } from "react";
import { Filter } from "lucide-react";

import styles from "./ProductsPage.module.css";

import { useAppSelector } from "../../app/hooks";

import Breadcrumb from "../../components/Breadcrumb";
import ProductFilters from "../../components/ProductFilters";
import ProductGrid from "../../components/ProductGrid";
import FilterDrawer from "../../components/FilterDrawer";
import SortDropdown, {
  type SortOption,
} from "../../components/SortDropdown";

import { useProducts } from "../../features/products/hooks/useProducts";
import { useSearchProducts } from "../../features/products/hooks/useSearchProducts";

const Products = () => {
  const tenantId =
    useAppSelector(
      (state) => state.tenant.currentTenant?.id
    ) ?? "";

  const filters = useAppSelector(
    (state) => state.products.filters
  );

  const [sort, setSort] =
    useState<SortOption>("newest");

  const [drawerOpen, setDrawerOpen] =
    useState(false);

  useEffect(() => {
    document.body.style.overflow = drawerOpen
      ? "hidden"
      : "auto";

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [drawerOpen]);

  const hasFilters = useMemo(() => {
    return (
      filters.categories.length > 0 ||
      filters.colors.length > 0 ||
      filters.sizes.length > 0 ||
      filters.rating !== null ||
      filters.priceRange[0] !== 0 ||
      filters.priceRange[1] !== 100000
    );
  }, [filters]);

  // All Products API
  const allProductsQuery = useProducts("TENANT001");

  // Search API
  const searchProductsQuery =
    useSearchProducts(
      {
        tenantId,

        categoryId:
          filters.categories.length > 0
            ? filters.categories[0]
            : undefined,

        colors:
          filters.colors.length > 0
            ? filters.colors
            : undefined,

        sizes:
          filters.sizes.length > 0
            ? filters.sizes
            : undefined,

        minPrice: filters.priceRange[0],
        maxPrice: filters.priceRange[1],

        rating:
          filters.rating ?? undefined,

        sort,
      },
      hasFilters
    );

  const products = hasFilters
    ? searchProductsQuery.data ?? []
    : allProductsQuery.data ?? [];

  const isLoading = hasFilters
    ? searchProductsQuery.isLoading
    : allProductsQuery.isLoading;

  const isError = hasFilters
    ? searchProductsQuery.isError
    : allProductsQuery.isError;

  if (isLoading) {
    return <h2>Loading...</h2>;
  }

  if (isError) {
    return (
      <h2>Something went wrong.</h2>
    );
  }

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

          <p>
            {products.length} Products Found
          </p>
        </div>

        <div className={styles.actions}>
          <button
            className={styles.filterBtn}
            onClick={() =>
              setDrawerOpen(true)
            }
          >
            <Filter size={18} />
            Filters
          </button>

          <SortDropdown
            value={sort}
            onChange={setSort}
          />
        </div>
      </div>

      <div className={styles.content}>
        <aside className={styles.sidebar}>
          <ProductFilters />
        </aside>

        <main className={styles.products}>
          <ProductGrid
            products={products}
          />
        </main>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() =>
          setDrawerOpen(false)
        }
      >
        <ProductFilters />
      </FilterDrawer>
    </div>
  );
};

export default Products;