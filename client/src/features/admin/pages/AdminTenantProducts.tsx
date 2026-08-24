import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from "../hooks/useTenantProducts";
import { useTenantByTenantId } from "../hooks/useTenants";
import styles from "../styles/AdminTenantProducts.module.css";
interface Product {
  _id?: string;
  id?: string;
  tenantId: string;
  name: string;
  description?: string;
  categoryId?: string;
  price?: number;
  discountPercentage?: number;
  finalPrice?: number;
  stock?: number;
  sizes?: string[];
  colors?: string[];
  images?: string[];
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}
interface EditForm {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  discountPercentage: string;
  stock: string;
  sizes: string;
  colors: string;
  images: string[];
  isActive: boolean;
}
export default function AdminTenantProducts() {
  const { tenantId } = useParams();
  const navigate = useNavigate();
const imageInputRef = useRef<HTMLInputElement | null>(null);
  const {
    data: tenant,
    isLoading: tenantLoading,
    isError: tenantError,
  } = useTenantByTenantId(tenantId || "");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    name: "",
    description: "",
    categoryId: "",
    price: "",
    discountPercentage: "",
    stock: "",
    sizes: "",
    colors: "",
    images: [],
    isActive: true,
  });
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const {
    data,
    isLoading: productsLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isError: productsError,
  } = useProducts({
    tenantId: tenantId || "",
    page: 1,
    limit: 10,
    search: search || undefined,
    categoryIds: category ? [category] : undefined,
  });
  const products = useMemo<Product[]>(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => {
      if (Array.isArray(page)) {
        return page as Product[];
      }
      if (Array.isArray(page?.data)) {
        return page.data as Product[];
      }
      return [];
    });
  }, [data]);
  useEffect(() => {
    const handleScroll = () => {
      if (productsLoading || isFetchingNextPage || !hasNextPage) {
        return;
      }
      const scrollPosition = window.innerHeight + window.scrollY;
      const pageHeight = document.documentElement.scrollHeight;
      if (scrollPosition >= pageHeight - 300) {
        fetchNextPage();
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [productsLoading, isFetchingNextPage, hasNextPage, fetchNextPage]);
  const formatPrice = (price: number | undefined) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(price || 0);
  };
  const handleAddProduct = () => {
    navigate(`/admin/products/create?tenantId=${tenantId}`);
  };
  const clearFilters = () => {
    setSearchInput("");
    setSearch("");
    setCategory("");
  };
  const hasFilters = searchInput !== "" || category !== "";
  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name || "",
      description: product.description || "",
      categoryId: product.categoryId || "",
      price: String(product.price ?? ""),
      discountPercentage: String(product.discountPercentage ?? ""),
      stock: String(product.stock ?? ""),
      sizes: Array.isArray(product.sizes) ? product.sizes.join(", ") : "",
      colors: Array.isArray(product.colors) ? product.colors.join(", ") : "",
      images: Array.isArray(product.images) ? product.images : [],
      isActive: Boolean(product.isActive),
    });
  };
  /**
   * Convert selected image to Base64.
   */
  const convertImageToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Unable to convert image to Base64"));
        }
      };
      reader.onerror = () => {
        reject(new Error("Failed to read image"));
      };
      reader.readAsDataURL(file);
    });
  };
  /**
   * Handle selecting multiple images.
   */
  const handleImageSelect = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) {
      return;
    }
    const selectedFiles = Array.from(files);
    const invalidFiles = selectedFiles.filter(
      (file) => !file.type.startsWith("image/"),
    );
    if (invalidFiles.length > 0) {
      alert("Please select only image files.");
      event.target.value = "";
      return;
    }
    try {
      const base64Images = await Promise.all(
        selectedFiles.map((file) => convertImageToBase64(file)),
      );
      setEditForm((prev) => ({
        ...prev,
        images: [...prev.images, ...base64Images],
      }));
    } catch (error) {
      console.error("Failed to convert image:", error);
      alert("Failed to process image.");
    }
    event.target.value = "";
  };
  /**
   * Remove one image from the selected images.
   */
  const handleRemoveImage = (index: number) => {
    setEditForm((prev) => ({
      ...prev,
      images: prev.images.filter((_, imageIndex) => imageIndex !== index),
    }));
  };
  const handleUpdate = async () => {
    if (!editingProduct || !tenantId) {
      return;
    }
    const productId = editingProduct._id || editingProduct.id;
    if (!productId) {
      return;
    }
    try {
      await updateProductMutation.mutateAsync({
        productId,
        payload: {
          tenantId,
          name: editForm.name.trim(),
          description: editForm.description.trim(),
          categoryId: editForm.categoryId.trim(),
          price: Number(editForm.price),
          discountPercentage: Number(editForm.discountPercentage),
          stock: Number(editForm.stock),
          sizes: editForm.sizes
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          colors: editForm.colors
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          images: editForm.images,
          isActive: editForm.isActive,
        },
      });
      setEditingProduct(null);
    } catch (error) {
      console.error("Failed to update product:", error);
    }
  };
  const handleDelete = async () => {
    if (!deleteProduct || !tenantId) {
      return;
    }
    const productId = deleteProduct._id || deleteProduct.id;
    if (!productId) {
      return;
    }
    try {
      await deleteProductMutation.mutateAsync({
        productId,
        tenantId,
      });
      setDeleteProduct(null);
    } catch (error) {
      console.error("Failed to delete product:", error);
    }
  };
  if (tenantLoading) {
    return <div className={styles.loading}>Loading tenant...</div>;
  }
  if (tenantError || !tenant) {
    return <div className={styles.error}>Tenant not found.</div>;
  }
  if (productsError) {
    return <div className={styles.error}>Failed to load products.</div>;
  }
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{tenant.tenantId}</span>
          <h1>Products</h1>
          <p>
            Manage products for <strong>{tenant.name}</strong>
          </p>
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={handleAddProduct}
        >
          <span>+</span>
          Add Product
        </button>
      </div>
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>◫</span>
          <div>
            <span>Total Products</span>
            <strong>{data?.pages?.[0]?.totalCount ?? 0}</strong>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>✓</span>
          <div>
            <span>Loaded Products</span>
            <strong>{products.length}</strong>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>!</span>
          <div>
            <span>Low Stock</span>
            <strong>
              {
                products.filter(
                  (product) =>
                    (product.stock ?? 0) > 0 && (product.stock ?? 0) < 10,
                ).length
              }
            </strong>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>₹</span>
          <div>
            <span>Inventory Value</span>
            <strong>
              {formatPrice(
                products.reduce(
                  (total, product) =>
                    total + (product.finalPrice || 0) * (product.stock || 0),
                  0,
                ),
              )}
            </strong>
          </div>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span className={styles.searchIcon}>⌕</span>
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search products..."
          />
          {searchInput && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
            >
              ×
            </button>
          )}
        </div>
        <div className={styles.selectWrapper}>
          <select
            className={styles.select}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">All Categories</option>
            <option value="electronics">Electronics</option>
            <option value="mobiles">Mobiles</option>
            <option value="laptops">Laptops</option>
            <option value="women-fashion">Women's Fashion</option>
            <option value="men-fashion">Men's Fashion</option>
            <option value="footwear">Footwear</option>
            <option value="beauty">Beauty</option>
            <option value="home-kitchen">Home & Kitchen</option>
            <option value="sports">Sports</option>
            <option value="books">Books</option>
          </select>
        </div>
        {hasFilters && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={clearFilters}
          >
            Clear
          </button>
        )}
      </div>
      {hasFilters && (
        <div className={styles.activeFilters}>
          <span>Filters:</span>
          {search && <span className={styles.filterTag}>Search: {search}</span>}
          {category && (
            <span className={styles.filterTag}>Category: {category}</span>
          )}
        </div>
      )}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div>
            <h2>Product List</h2>
            <span>
              {search ? `Search results for "${search}"` : "All products"}
            </span>
          </div>
          <span>{products.length} loaded</span>
        </div>
        {productsLoading ? (
          <div className={styles.loading}>Loading products...</div>
        ) : products.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◫</div>
            <h3>No products found</h3>
            <p>
              {search || category
                ? "Try changing your filters."
                : "Add your first product to start building your store."}
            </p>
            {(search || category) && (
              <button
                type="button"
                className={styles.emptyClearButton}
                onClick={clearFilters}
              >
                Clear Filters
              </button>
            )}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => {
                  const productName = product.name || "Unnamed Product";
                  const productId = product._id || product.id || "unknown";
                  return (
                    <tr key={productId}>
                      <td>
                        <div className={styles.product}>
                          <div className={styles.productImage}>
                            {product.images?.[0] ? (
                              <img src={product.images[0]} alt={productName} />
                            ) : (
                              productName.charAt(0).toUpperCase()
                            )}
                          </div>
                          <div className={styles.productInfo}>
                            <strong>{productName}</strong>
                            <span>ID: {productId.slice(-8)}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={styles.category}>
                          {product.categoryId || "Uncategorized"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.price}>
                          <strong>{formatPrice(product.finalPrice)}</strong>
                          {(product.discountPercentage || 0) > 0 && (
                            <span>{formatPrice(product.price)}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            (product.stock ?? 0) < 10
                              ? styles.lowStock
                              : styles.stock
                          }
                        >
                          {product.stock ?? 0}
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
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.editButton}
                            onClick={() => handleEdit(product)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className={styles.deleteButton}
                            onClick={() => setDeleteProduct(product)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {isFetchingNextPage && (
          <div className={styles.loadingMore}>Loading more products...</div>
        )}
        {!hasNextPage && products.length > 0 && (
          <div className={styles.endMessage}>All products loaded</div>
        )}
      </div>
      {editingProduct && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditingProduct(null);
            }
          }}
        >
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalEyebrow}>Product</span>
                <h2>Edit Product</h2>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setEditingProduct(null)}
              >
                ×
              </button>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Product Name</label>
                <input
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      name: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Category</label>
                <input
                  value={editForm.categoryId}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      categoryId: event.target.value,
                    })
                  }
                />
              </div>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      description: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Price</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.price}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      price: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Discount %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={editForm.discountPercentage}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      discountPercentage: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Stock</label>
                <input
                  type="number"
                  min="0"
                  value={editForm.stock}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      stock: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Sizes</label>
                <input
                  placeholder="S, M, L, XL"
                  value={editForm.sizes}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      sizes: event.target.value,
                    })
                  }
                />
              </div>
              <div className={styles.formGroup}>
                <label>Colors</label>
                <input
                  placeholder="Black, Blue, Red"
                  value={editForm.colors}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      colors: event.target.value,
                    })
                  }
                />
              </div>
              {/* IMAGE UPLOAD */}
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Product Images</label>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  multiple
                  onChange={handleImageSelect}
                  className={styles.hiddenFileInput}
                />
                <div className={styles.imageUploadBox}>
                  <button
                    type="button"
                    className={styles.chooseImageButton}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    <span className={styles.uploadIcon}>＋</span>
                    Choose Images
                  </button>
                  <span className={styles.imageUploadText}>
                    PNG, JPG, JPEG or WEBP
                  </span>
                </div>
                {editForm.images.length > 0 && (
                  <div className={styles.imagePreviewGrid}>
                    {editForm.images.map((image, index) => (
                      <div
                        key={`${image.slice(0, 30)}-${index}`}
                        className={styles.imagePreview}
                      >
                        <img src={image} alt={`Product ${index + 1}`} />
                        <button
                          type="button"
                          className={styles.removeImageButton}
                          onClick={() => handleRemoveImage(index)}
                        >
                          ×
                        </button>
                        <span className={styles.imageNumber}>{index + 1}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <label className={styles.activeToggle}>
                <input
                  type="checkbox"
                  checked={editForm.isActive}
                  onChange={(event) =>
                    setEditForm({
                      ...editForm,
                      isActive: event.target.checked,
                    })
                  }
                />
                <span>Product Active</span>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setEditingProduct(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveButton}
                onClick={handleUpdate}
                disabled={updateProductMutation.isPending}
              >
                {updateProductMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteProduct && (
        <div
          className={styles.modalOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteProduct(null);
            }
          }}
        >
          <div className={styles.deleteModal}>
            <div className={styles.deleteIcon}>!</div>
            <h2>Delete Product?</h2>
            <p>
              Are you sure you want to delete{" "}
              <strong>{deleteProduct.name}</strong>?
            </p>
            <span className={styles.deleteWarning}>
              This action cannot be undone.
            </span>
            <div className={styles.deleteActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDeleteProduct(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmDeleteButton}
                onClick={handleDelete}
                disabled={deleteProductMutation.isPending}
              >
                {deleteProductMutation.isPending
                  ? "Deleting..."
                  : "Delete Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
