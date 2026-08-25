import { useMemo } from "react";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { setFilters, clearFilters } from "../../features/products/productSlice";
import FilterSection from "./FilterSection";
import PriceRange from "./PriceRange";
import RatingFilter from "./RatingFilter";
import ColorFilter from "./ColorFilter";
import SizeFilter from "./SizeFilter";
import styles from "./ProductFilters.module.css";

const ProductFilters = () => {
  const dispatch = useAppDispatch();
  const filters = useAppSelector((state) => state.products.filters);
  const catalogFilter = useAppSelector((state) => state.products.catalogFilter);
  const categories = catalogFilter?.category ?? [];
  const colors = catalogFilter?.color ?? [];
  const sizes = catalogFilter?.size ?? [];
  const brands = catalogFilter?.brand ?? [];
  const priceMin = catalogFilter?.price?.min ?? 0;
  const priceMax = Math.max(catalogFilter?.price?.max ?? 0, priceMin);
  const hasPriceRange = Boolean(catalogFilter) && priceMax > priceMin;
  const isDefaultPrice =
    !catalogFilter ||
    (filters.priceRange[0] <= priceMin && filters.priceRange[1] >= priceMax);
  const sliderValues = isDefaultPrice
    ? [priceMin, priceMax]
    : [
        Math.min(Math.max(filters.priceRange[0], priceMin), priceMax),
        Math.max(Math.min(filters.priceRange[1], priceMax), priceMin),
      ];
  const activeFilterCount = useMemo(() => {
    let count = 0;
    count += filters.categories.length;
    count += filters.colors.length;
    count += filters.sizes.length;
    count += filters.brands.length;
    if (filters.rating !== null) {
      count += 1;
    }
    if (!isDefaultPrice) {
      count += 1;
    }
    if (filters.search.trim()) {
      count += 1;
    }
    return count;
  }, [filters, isDefaultPrice]);
  const toggleCategory = (id: string) => {
    dispatch(
      setFilters({
        categories: filters.categories.includes(id)
          ? filters.categories.filter((categoryId) => categoryId !== id)
          : [...filters.categories, id],
      }),
    );
  };
  const toggleBrand = (brand: string) => {
    dispatch(
      setFilters({
        brands: filters.brands.includes(brand)
          ? filters.brands.filter((item) => item !== brand)
          : [...filters.brands, brand],
      }),
    );
  };
  if (!catalogFilter) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.title}>
          <div className={styles.titleLeft}>
            <h2>Filters</h2>
          </div>
        </div>
        <div className={styles.loadingState}>
          <span className={styles.loadingDot} />
          <span>Loading filters...</span>
        </div>
      </div>
    );
  }
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
      {categories.length > 0 && (
        <FilterSection title="Category">
          <div className={styles.list}>
            {categories.map((category) => (
              <label key={category.id} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={filters.categories.includes(category.id)}
                  onChange={() => toggleCategory(category.id)}
                />
                <span>{category.name}</span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}
      {brands.length > 0 && (
        <FilterSection title="Brand">
          <div className={styles.list}>
            {brands.map((brand) => (
              <label key={brand} className={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={filters.brands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                />
                <span>{brand}</span>
              </label>
            ))}
          </div>
        </FilterSection>
      )}
      {hasPriceRange && (
        <FilterSection title="Price">
          <PriceRange
            values={sliderValues}
            min={priceMin}
            max={priceMax}
            onChange={(priceRange) =>
              dispatch(
                setFilters({
                  priceRange,
                }),
              )
            }
          />
        </FilterSection>
      )}
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
      {colors.length > 0 && (
        <FilterSection title="Colors">
          <ColorFilter
            colors={colors}
            selectedColors={filters.colors}
            onChange={(nextColors) =>
              dispatch(
                setFilters({
                  colors: nextColors,
                }),
              )
            }
          />
        </FilterSection>
      )}
      {sizes.length > 0 && (
        <FilterSection title="Sizes">
          <SizeFilter
            sizes={sizes}
            selectedSizes={filters.sizes}
            onChange={(nextSizes) =>
              dispatch(
                setFilters({
                  sizes: nextSizes,
                }),
              )
            }
          />
        </FilterSection>
      )}
    </div>
  );
};
export default ProductFilters;
