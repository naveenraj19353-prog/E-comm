import { useMemo } from "react";

import styles from "./Home.module.css";

import { useAppSelector } from "../app/hooks";

import { useProducts } from "../features/products/hooks/useProducts";
import { useCategory } from "../features/products/hooks/useCategory";
import { useHome } from "../features/home/hooks/useHome";


const Home = () => {
  const tenantSlug = useAppSelector(
    (state) => state.tenant.tenantSlug
  );

  const tenantId = useMemo(() => {
    return tenantSlug ? tenantSlug.toUpperCase() : "";
  }, [tenantSlug]);

  /*
   * Products
   */
  const {
    data: productResponse,
    isLoading: productsLoading,
    isError,
    refetch,
  } = useProducts({
    tenantId,
    limit: 100,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  /*
   * Categories
   */
  const {
    data: categoryResponse,
    isLoading: categoriesLoading,
  } = useCategory(tenantId);

  /*
   * Home API
   */
  const {
    data: homeData,
    isLoading: homeLoading,
    isError: homeError,
  } = useHome(tenantId);

  /*
   * Product pages
   */
  const products =
    productResponse?.pages.flatMap(
      (page) => page.data
    ) ?? [];

  /*
   * Loading
   */
  if (
    productsLoading ||
    categoriesLoading ||
    homeLoading
  ) {
    return (
      <div className={styles.loading}>
        Loading store...
      </div>
    );
  }

  /*
   * Error
   */
  if (isError || homeError) {
    return (
      <div className={styles.error}>
        <h2>Unable to load store</h2>

        <button onClick={() => refetch()}>
          Retry
        </button>
      </div>
    );
  }

  /*
   * Safety
   */
  if (!homeData) {
    return null;
  }

  return (
    <main className={styles.home}>

    

    </main>
  );
};

export default Home;