import { useAppDispatch, useAppSelector } from "../../app/hooks";

import {
  setFilters,
  clearFilters,
} from "../../features/products/productSlice";

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

  const tenantId =
    useAppSelector(
      (state) => state.tenant.currentTenant?.id
    ) ?? "";

  const filters = useAppSelector(
    (state) => state.products.filters
  );
console.log(store.getState().products.filters);
  const {
    data: categories,
    isLoading ,
    isError,
    error,
  } = useCategory("TENANT001");

  // Temporary Data
  // Later these will come from API

  const colors = [
    "Black",
    "White",
    "Grey",
    "Green",
    "Red",
  ];

  const sizes = [
    "XS",
    "S",
    "M",
    "L",
    "XL",
    "XXL",
  ];

  const toggleCategory = (id: string) => {
    dispatch(
      setFilters({
        categories: filters.categories.includes(id)
          ? filters.categories.filter(
              (categoryId) => categoryId !== id
            )
          : [...filters.categories, id],
      })
    );
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.title}>
        <h2>Filters</h2>

        <button
          onClick={() => dispatch(clearFilters())}
        >
          Clear
        </button>
      </div>

      {/* Category */}

      <FilterSection title="Category">
        {isLoading ? (
          <p>Loading Categories...</p>
        ) : isError ? (
          <p className={styles.error}>
            {(error as Error).message}
          </p>
        ) : categories?.data?.length === 0 ? (
          <p>No Categories Found</p>
        ) : (
          <div className={styles.list}>
            {categories?.data?.map((category) => (
              <label
                key={category._id}
                className={styles.checkbox}
              >
                <input
                  type="checkbox"
                  checked={filters.categories.includes(
                    category._id
                  )}
                  onChange={() =>
                    toggleCategory(category._id)
                  }
                />

                <span>{category.name}</span>
              </label>
            ))}
          </div>
        )}
      </FilterSection>

      {/* Price */}

      <FilterSection title="Price">
        <PriceRange
          values={filters.priceRange}
          min={0}
          max={100000}
          onChange={(priceRange) =>
            dispatch(
              setFilters({
                priceRange,
              })
            )
          }
        />
      </FilterSection>

      {/* Rating */}

      <FilterSection title="Rating">
        <RatingFilter
          value={filters.rating}
          onChange={(rating) =>
            dispatch(
              setFilters({
                rating,
              })
            )
          }
        />
      </FilterSection>

      {/* Colors */}

      <FilterSection title="Colors">
        <ColorFilter
          colors={colors}
          selectedColors={filters.colors}
          onChange={(colors) =>
            dispatch(
              setFilters({
                colors,
              })
            )
          }
        />
      </FilterSection>

      {/* Sizes */}

      <FilterSection title="Sizes">
        <SizeFilter
          sizes={sizes}
          selectedSizes={filters.sizes}
          onChange={(sizes) =>
            dispatch(
              setFilters({
                sizes,
              })
            )
          }
        />
      </FilterSection>
    </div>
  );
};

export default ProductFilters;