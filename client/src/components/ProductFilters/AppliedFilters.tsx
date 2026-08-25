import { X } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../../app/hooks";
import { setFilters, clearFilters } from "../../features/products/productSlice";
import styles from "./AppliedFilters.module.css";

const AppliedFilters = () => {
  const dispatch = useAppDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useAppSelector((state) => state.products.filters);
  const catalogFilter = useAppSelector((state) => state.products.catalogFilter);
  const search = searchParams.get("search") ?? "";
  const priceMin = catalogFilter?.price?.min ?? 0;
  const priceMax = catalogFilter?.price?.max ?? 100000;
  const categoryName = (categoryId: string) =>
    catalogFilter?.category.find((item) => item.id === categoryId)?.name ||
    categoryId;
  const removeSearch = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    params.set("page", "1");
    dispatch(
      setFilters({
        search: "",
      }),
    );
    setSearchParams(params);
  };
  const removeCategory = (category: string) => {
    const params = new URLSearchParams(searchParams);
    const categories = params
      .getAll("categoryIds")
      .filter((item) => item !== category);
    params.delete("categoryIds");
    categories.forEach((item) => {
      params.append("categoryIds", item);
    });
    params.set("page", "1");
    dispatch(
      setFilters({
        categories,
      }),
    );
    setSearchParams(params);
  };
  const removeColor = (color: string) => {
    const params = new URLSearchParams(searchParams);
    const colors = params.getAll("colors").filter((item) => item !== color);
    params.delete("colors");
    colors.forEach((item) => {
      params.append("colors", item);
    });
    params.set("page", "1");
    dispatch(
      setFilters({
        colors,
      }),
    );
    setSearchParams(params);
  };
  const removeSize = (size: string) => {
    const params = new URLSearchParams(searchParams);
    const sizes = params.getAll("sizes").filter((item) => item !== size);
    params.delete("sizes");
    sizes.forEach((item) => {
      params.append("sizes", item);
    });
    params.set("page", "1");
    dispatch(
      setFilters({
        sizes,
      }),
    );
    setSearchParams(params);
  };
  const removeBrand = (brand: string) => {
    const params = new URLSearchParams(searchParams);
    const brands = params.getAll("brands").filter((item) => item !== brand);
    params.delete("brands");
    brands.forEach((item) => {
      params.append("brands", item);
    });
    params.set("page", "1");
    dispatch(
      setFilters({
        brands,
      }),
    );
    setSearchParams(params);
  };
  const removeRating = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("rating");
    params.set("page", "1");
    dispatch(
      setFilters({
        rating: null,
      }),
    );
    setSearchParams(params);
  };
  const removePrice = () => {
    const params = new URLSearchParams(searchParams);
    params.delete("minPrice");
    params.delete("maxPrice");
    params.set("page", "1");
    dispatch(
      setFilters({
        priceRange: [priceMin, priceMax],
      }),
    );
    setSearchParams(params);
  };
  const clearAll = () => {
    dispatch(clearFilters());
    setSearchParams({});
  };
  const hasPriceFilter =
    filters.priceRange[0] > priceMin || filters.priceRange[1] < priceMax;
  const hasFilters =
    Boolean(search) ||
    filters.categories.length > 0 ||
    filters.colors.length > 0 ||
    filters.sizes.length > 0 ||
    filters.brands.length > 0 ||
    filters.rating !== null ||
    hasPriceFilter;
  if (!hasFilters) {
    return null;
  }
  return (
    <div className={styles.wrapper}>
      <div className={styles.chips}>
        {search && (
          <button type="button" className={styles.chip} onClick={removeSearch}>
            Search: {search}
            <X size={14} />
          </button>
        )}
        {filters.categories.map((category) => (
          <button
            type="button"
            key={`category-${category}`}
            className={styles.chip}
            onClick={() => removeCategory(category)}
          >
            {categoryName(category)}
            <X size={14} />
          </button>
        ))}
        {filters.colors.map((color) => (
          <button
            type="button"
            key={`color-${color}`}
            className={styles.chip}
            onClick={() => removeColor(color)}
          >
            {color}
            <X size={14} />
          </button>
        ))}
        {filters.sizes.map((size) => (
          <button
            type="button"
            key={`size-${size}`}
            className={styles.chip}
            onClick={() => removeSize(size)}
          >
            Size: {size}
            <X size={14} />
          </button>
        ))}
        {filters.brands.map((brand) => (
          <button
            type="button"
            key={`brand-${brand}`}
            className={styles.chip}
            onClick={() => removeBrand(brand)}
          >
            {brand}
            <X size={14} />
          </button>
        ))}
        {filters.rating !== null && (
          <button type="button" className={styles.chip} onClick={removeRating}>
            {filters.rating}★ & Up
            <X size={14} />
          </button>
        )}
        {hasPriceFilter && (
          <button type="button" className={styles.chip} onClick={removePrice}>
            ₹{filters.priceRange[0]}
            {" - "}₹{filters.priceRange[1]}
            <X size={14} />
          </button>
        )}
      </div>
      <button type="button" className={styles.clear} onClick={clearAll}>
        Clear All
      </button>
    </div>
  );
};
export default AppliedFilters;
