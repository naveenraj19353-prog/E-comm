import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import styles from "../styles/ProductsPage.module.css";
import apiClient from "../../../api/client";
import { useAppSelector } from "../../../app/hooks";
interface Product {
  _id: string;
  tenantId: string;
  name: string;
  description: string;
  categoryId: string;
  price: number;
  discountPercentage: number;
  finalPrice: number;
  stock: number;
  sizes: string[];
  colors: string[];
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  averageRating: number;
  reviewCount: number;
}
interface ProductsResponse {
  success: boolean;
  count: number;
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  data: Product[];
}
export default function ProductsPage() {
  const navigate = useNavigate();
  const tenantIdStore =
    useAppSelector(
      (state) => state.tenant.currentTenant?.id || state.tenant.tenantSlug,
    ) ?? "";
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [tenantId, setTenantId] = useState(tenantIdStore);
  const [page, setPage] = useState(1);
  const limit = 10;
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        setError("");
        const response = await apiClient.get<ProductsResponse>(
          "/product/get-all-products",
          {
            params: {
              tenantId,
              page,
              limit,
              search: search || undefined,
            },
          },
        );
        setProducts(response.data.data);
      } catch (err) {
        console.error(err);
        setError("Failed to load products.");
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [tenantId, page, search]);
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price);
  };
  const handleSearch = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(event.target.value);
    setPage(1);
  };
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>CATALOG</span>
          <h1>Products</h1>
          <p>Manage products across your stores.</p>
        </div>
        <button
          type="button"
          className={styles.createButton}
          onClick={() => navigate("/admin/products/create")}
        >
          <span>+</span>
          Add Product
        </button>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span>⌕</span>
          <input
            type="text"
            value={search}
            onChange={handleSearch}
            placeholder="Search products..."
          />
        </div>
        <select
          className={styles.select}
          value={tenantId}
          onChange={(event) => {
            setTenantId(event.target.value);
            setPage(1);
          }}
        >
          <option value="TENANT001">ShopSphere</option>
          <option value="TENANT002">MegaMart</option>
          <option value="TENANT003">UrbanCart</option>
        </select>
      </div>
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>All Products</h2>
            <span>Products for {tenantId}</span>
          </div>
          <span className={styles.productCount}>
            {products.length} products
          </span>
        </div>
        {loading ? (
          <div className={styles.state}>Loading products...</div>
        ) : error ? (
          <div className={styles.stateError}>{error}</div>
        ) : products.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>+</div>
            <h3>No products found</h3>
            <p>Try changing your search or create a new product.</p>
            <button
              type="button"
              onClick={() => navigate("/admin/products/create")}
            >
              Add Product
            </button>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product._id}>
                    <td>
                      <div className={styles.product}>
                        <div className={styles.productImage}>
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt={product.name} />
                          ) : (
                            <span>{product.name.charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        <div className={styles.productInfo}>
                          <strong>{product.name}</strong>
                          <span>ID: {product._id.slice(-8)}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={styles.category}>
                        {product.categoryId}
                      </span>
                    </td>
                    <td>
                      <div className={styles.price}>
                        <strong>{formatPrice(product.finalPrice)}</strong>
                        {product.discountPercentage > 0 && (
                          <span>{formatPrice(product.price)}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          product.stock === 0
                            ? styles.outOfStock
                            : product.stock < 10
                              ? styles.lowStock
                              : styles.stock
                        }
                      >
                        {product.stock}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          product.isActive ? styles.active : styles.inactive
                        }
                      >
                        <span className={styles.statusDot} />
                        {product.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <span className={styles.date}>
                        {product.createdAt
                          ? new Date(product.createdAt).toLocaleDateString()
                          : "-"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.editButton}
                        onClick={() =>
                          navigate(`/admin/products/${product._id}/edit`)
                        }
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && products.length > 0 && (
          <div className={styles.pagination}>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              ← Previous
            </button>
            <span>Page {page}</span>
            <button
              type="button"
              disabled={products.length < limit}
              onClick={() => setPage((current) => current + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
