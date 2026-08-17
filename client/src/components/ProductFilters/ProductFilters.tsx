import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { setFilters, clearFilters } from "../../features/products/productSlice";
import { useCategory } from "../../features/products/hooks/useCategory";
import FilterSection from "./FilterSection";
import PriceRange from "./PriceRange";
import RatingFilter from "./RatingFilter";
import ColorFilter from "./ColorFilter";
import SizeFilter from "./SizeFilter";
import styles from "./ProductFilters.module.css";
import { store } from "../../app/store";
const ProductFilters = () => {
  const dispatch = useAppDispatch();
  const tenantId = useAppSelector((state) => state.tenant.currentTenant?.id || state.tenant.tenantSlug) ?? "";
  const filters = useAppSelector((state) => state.products.filters);
  console.log(store.getState())
  const {
    data: categories,
    isLoading,
    isError,
    error,
  } = useCategory(tenantId);
  const colors = ["Black", "White", "Grey", "Green", "Red"];
  const sizes = ["XS", "S", "M", "L", "XL", "XXL"];
  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.categories.length;
    count += filters.colors.length;
    count += filters.sizes.length;
    if (filters.rating !== null) {
      count += 1;
    }
    const isDefaultPrice =
      filters.priceRange[0] === 0 && filters.priceRange[1] === 100000;
    if (!isDefaultPrice) {
      count += 1;
    }
    if (filters.search.trim()) {
      count += 1;
    }
    return count;
  }, [filters]);
  const toggleCategory = (id: string) => {
    dispatch(
      setFilters({
        categories: filters.categories.includes(id)
          ? filters.categories.filter((categoryId) => categoryId !== id)
          : [...filters.categories, id],
      }),
    );
  };
  return (
    <div className={styles.wrapper}>
     
      <div className={styles.title}>
        <div className={styles.titleLeft}>
          <h2>Filters</h2>
          {activeFilterCount > 0 && (
            <span className={styles.activeCount}>{activeFilterCount}</span>
          )}
        </div>
        {activeFilterCount > 0 && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => dispatch(clearFilters())}
          >
            Clear all
          </button>
        )}
      </div>
     
      <FilterSection title="Category">
        {isLoading ? (
          <div className={styles.loadingState}>
            <span className={styles.loadingDot} />
            <span>Loading categories...</span>
          </div>
        ) : isError ? (
          <div className={styles.error}>
            {(error as Error)?.message || "Unable to load categories."}
          </div>
        ) : categories?.data?.length === 0 ? (
          <p className={styles.emptyText}>No categories found</p>
        ) : (
          <div className={styles.list}>
            {categories?.data?.map((category) => (
              <label key={category._id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category.name)}
                  onChange={() => toggleCategory(category.name)}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        )}
      </FilterSection>
     
      <FilterSection title="Price">
        <PriceRange
          values={filters.priceRange}
          min={0}
          max={100000}
          onChange={(priceRange) =>
            dispatch(
              setFilters({
                priceRange,
              }),
            )
          }
        />
      </FilterSection>
     
      <FilterSection title="Rating">
        <RatingFilter
          value={filters.rating}
          onChange={(rating) =>
            dispatch(
              setFilters({
                rating,
              }),
            )
          }
        />
      </FilterSection>
     
      <FilterSection title="Colors">
        <ColorFilter
          colors={colors}
          selectedColors={filters.colors}
          onChange={(colors) =>
            dispatch(
              setFilters({
                colors,
              }),
            )
          }
        />
      </FilterSection>
     
      <FilterSection title="Sizes">
        <SizeFilter
          sizes={sizes}
          selectedSizes={filters.sizes}
          onChange={(sizes) =>
            dispatch(
              setFilters({
                sizes,
              }),
            )
          }
        />
      </FilterSection>
    </div>
  );
};
export default ProductFilters;
