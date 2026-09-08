import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ProductImage from "../../../components/ProductImage";
import { getFirstProductImage } from "../../products/inventory";
import { useDeleteProduct, useProducts, useUpdateProduct, } from "../hooks/useTenantProducts";
import { useTenantByTenantId } from "../hooks/useTenants";
import styles from "../styles/AdminTenantProducts.module.css";

interface ProductInventory {
    variantId?: string;
    color?: string;
    size?: string;
    stock?: number;
}

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
    inventory?: ProductInventory[];
    images?: Record<string, string[]> | string[];
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
    totalStock?: number;
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
    inventory: ProductInventory[];
    images: Record<string, string[]>;
    isActive: boolean;
}

const normalizeProductImages = (
    images?: Record<string, string[]> | string[] | null,
): Record<string, string[]> => {
    if (Array.isArray(images)) {
        const urls = images.filter((item) => typeof item === "string" && item.trim());
        return urls.length ? { Default: urls } : {};
    }
    if (!images || typeof images !== "object") {
        return {};
    }
    const normalized: Record<string, string[]> = {};
    for (const [color, rawValue] of Object.entries(images)) {
        const key = color.trim() || "Default";
        const value = rawValue as string[] | string;
        if (Array.isArray(value)) {
            const urls = value.filter((item) => typeof item === "string" && item.trim());
            if (urls.length) {
                normalized[key] = urls;
            }
        } else if (typeof value === "string" && value.trim()) {
            normalized[key] = [value.trim()];
        }
    }
    return normalized;
};

const getProductColors = (product: Product, images: Record<string, string[]>): string[] => {
    const colors = new Set<string>();
    for (const item of product.inventory || []) {
        const color = item.color?.trim();
        if (color) {
            colors.add(color);
        }
    }
    for (const color of product.colors || []) {
        if (color?.trim()) {
            colors.add(color.trim());
        }
    }
    for (const color of Object.keys(images)) {
        if (color.trim()) {
            colors.add(color.trim());
        }
    }
    return Array.from(colors);
};

export default function AdminTenantProducts() {
    const { tenantId } = useParams();
    const navigate = useNavigate();
    const imageInputRef = useRef<HTMLInputElement | null>(null);
    const { data: tenant, isLoading: tenantLoading, isError: tenantError, } = useTenantByTenantId(tenantId || "");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
    const [imageUploadColor, setImageUploadColor] = useState("Default");
    const [newColorInput, setNewColorInput] = useState("");
    const [newSizeInput, setNewSizeInput] = useState("");
    const [editingColorName, setEditingColorName] = useState<string | null>(null);
    const [colorRenameValue, setColorRenameValue] = useState("");
    const [editForm, setEditForm] = useState<EditForm>({
        name: "",
        description: "",
        categoryId: "",
        price: "",
        discountPercentage: "",
        stock: "",
        sizes: "",
        colors: "",
        inventory: [],
        images: {},
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
    const { data, isLoading: productsLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError: productsError, } = useProducts({
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
        navigate(`/admin/tenants/${tenantId}/products/create`);
    };
    const handleBulkImport = () => {
        navigate(`/admin/tenants/${tenantId}/products/bulk`);
    };
    const clearFilters = () => {
        setSearchInput("");
        setSearch("");
        setCategory("");
    };
    const hasFilters = searchInput !== "" || category !== "";
    const editColors = useMemo(() => {
        const fromInventory = editForm.inventory
            .map((item) => item.color?.trim())
            .filter((color): color is string => Boolean(color));
        const fromForm = editForm.colors
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        const fromImages = Object.keys(editForm.images);
        const colors = Array.from(new Set([...fromInventory, ...fromForm, ...fromImages]));
        return colors.length > 0 ? colors : ["Default"];
    }, [editForm.colors, editForm.images, editForm.inventory]);

    const editSizes = useMemo(() => {
        const fromInventory = editForm.inventory
            .map((item) => item.size?.trim())
            .filter((size): size is string => Boolean(size));
        const fromForm = editForm.sizes
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
        const sizes = Array.from(new Set([...fromInventory, ...fromForm]));
        return sizes.length > 0 ? sizes : ["Standard"];
    }, [editForm.inventory, editForm.sizes]);

    const editTotalStock = useMemo(() => {
        return editForm.inventory.reduce((total, item) => total + (Number(item.stock) || 0), 0);
    }, [editForm.inventory]);

    const slugifyVariantPart = (value: string) =>
        value.trim().toLowerCase().replace(/\s+/g, "-") || "default";

    const getInventoryStock = (color: string, size: string) => {
        const match = editForm.inventory.find(
            (item) =>
                (item.color || "").trim().toLowerCase() === color.trim().toLowerCase()
                && (item.size || "").trim().toLowerCase() === size.trim().toLowerCase(),
        );
        return Number(match?.stock) || 0;
    };

    const handleStockChange = (color: string, size: string, rawStock: string) => {
        const stock = Math.max(0, Number(rawStock) || 0);
        setEditForm((prev) => {
            const existingIndex = prev.inventory.findIndex(
                (item) =>
                    (item.color || "").trim().toLowerCase() === color.trim().toLowerCase()
                    && (item.size || "").trim().toLowerCase() === size.trim().toLowerCase(),
            );
            let nextInventory: ProductInventory[];
            if (existingIndex >= 0) {
                nextInventory = [...prev.inventory];
                nextInventory[existingIndex] = {
                    ...nextInventory[existingIndex],
                    stock,
                };
            } else {
                nextInventory = [
                    ...prev.inventory,
                    {
                        variantId: `${slugifyVariantPart(color)}-${slugifyVariantPart(size)}`,
                        color,
                        size,
                        stock,
                    },
                ];
            }
            return {
                ...prev,
                inventory: nextInventory,
                stock: String(
                    nextInventory.reduce((total, item) => total + (Number(item.stock) || 0), 0),
                ),
            };
        });
    };

    const handleEdit = (product: Product) => {
        const images = normalizeProductImages(product.images);
        const inventory = (product.inventory || []).map((item) => ({
            variantId: item.variantId || `${item.color || "default"}-${item.size || "standard"}`,
            color: item.color?.trim() || "Default",
            size: item.size?.trim() || "Standard",
            stock: Number(item.stock) || 0,
        }));
        const colors = getProductColors(product, images);
        const sizes = Array.from(
            new Set(
                inventory
                    .map((item) => item.size?.trim())
                    .filter((size): size is string => Boolean(size)),
            ),
        );
        setEditingProduct(product);
        setImageUploadColor(colors[0] || Object.keys(images)[0] || "Default");
        setEditForm({
            name: product.name || "",
            description: product.description || "",
            categoryId: product.categoryId || "",
            price: String(product.price ?? ""),
            discountPercentage: String(product.discountPercentage ?? ""),
            stock: String(product.totalStock ?? product.stock ?? ""),
            sizes: sizes.length
                ? sizes.join(", ")
                : Array.isArray(product.sizes)
                  ? product.sizes.join(", ")
                  : "",
            colors: colors.length
                ? colors.join(", ")
                : Array.isArray(product.colors)
                  ? product.colors.join(", ")
                  : "",
            inventory,
            images,
            isActive: Boolean(product.isActive),
        });
    };
    const convertImageToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === "string") {
                    resolve(reader.result);
                }
                else {
                    reject(new Error("Unable to convert image to Base64"));
                }
            };
            reader.onerror = () => {
                reject(new Error("Failed to read image"));
            };
            reader.readAsDataURL(file);
        });
    };
    const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) {
            return;
        }
        const selectedFiles = Array.from(files);
        const invalidFiles = selectedFiles.filter((file) => !file.type.startsWith("image/"));
        if (invalidFiles.length > 0) {
            alert("Please select only image files.");
            event.target.value = "";
            return;
        }
        const color = imageUploadColor.trim() || "Default";
        try {
            const base64Images = await Promise.all(selectedFiles.map((file) => convertImageToBase64(file)));
            setEditForm((prev) => ({
                ...prev,
                images: {
                    ...prev.images,
                    [color]: [...(prev.images[color] || []), ...base64Images],
                },
            }));
        }
        catch (error) {
            console.error("Failed to convert image:", error);
            alert("Failed to process image.");
        }
        event.target.value = "";
    };
    const handleRemoveImage = (color: string, index: number) => {
        setEditForm((prev) => {
            const nextForColor = (prev.images[color] || []).filter((_, imageIndex) => imageIndex !== index);
            const nextImages = { ...prev.images };
            if (nextForColor.length) {
                nextImages[color] = nextForColor;
            } else {
                delete nextImages[color];
            }
            return {
                ...prev,
                images: nextImages,
            };
        });
    };
    const handleRemoveColor = (colorToRemove: string) => {
        const normalized = colorToRemove.trim().toLowerCase();
        if (!normalized) {
            return;
        }
        const remainingColors = editColors.filter(
            (color) => color.trim().toLowerCase() !== normalized,
        );
        if (remainingColors.length === 0) {
            alert("At least one color is required.");
            return;
        }
        const confirmed = window.confirm(
            `Remove color "${colorToRemove}"? This deletes its variants and images.`,
        );
        if (!confirmed) {
            return;
        }
        setEditForm((prev) => {
            const nextInventory = prev.inventory.filter(
                (item) => (item.color || "").trim().toLowerCase() !== normalized,
            );
            const nextImages = Object.fromEntries(
                Object.entries(prev.images).filter(
                    ([color]) => color.trim().toLowerCase() !== normalized,
                ),
            );
            const nextColors = prev.colors
                .split(",")
                .map((item) => item.trim())
                .filter((color) => color && color.toLowerCase() !== normalized);
            return {
                ...prev,
                inventory: nextInventory,
                images: nextImages,
                colors: nextColors.join(", "),
                stock: String(
                    nextInventory.reduce((total, item) => total + (Number(item.stock) || 0), 0),
                ),
            };
        });
        setImageUploadColor((current) =>
            current.trim().toLowerCase() === normalized
                ? remainingColors[0]
                : current,
        );
        if (editingColorName?.trim().toLowerCase() === normalized) {
            setEditingColorName(null);
            setColorRenameValue("");
        }
    };
    const startRenameColor = (color: string) => {
        setEditingColorName(color);
        setColorRenameValue(color);
    };
    const cancelRenameColor = () => {
        setEditingColorName(null);
        setColorRenameValue("");
    };
    const saveRenameColor = () => {
        if (!editingColorName) {
            return;
        }
        const oldColor = editingColorName.trim();
        const newColor = colorRenameValue.trim();
        if (!newColor) {
            alert("Color name cannot be empty.");
            return;
        }
        if (oldColor.toLowerCase() === newColor.toLowerCase()) {
            cancelRenameColor();
            return;
        }
        const conflict = editColors.some(
            (color) =>
                color.trim().toLowerCase() === newColor.toLowerCase()
                && color.trim().toLowerCase() !== oldColor.toLowerCase(),
        );
        if (conflict) {
            alert(`Color "${newColor}" already exists.`);
            return;
        }
        const oldNormalized = oldColor.toLowerCase();
        setEditForm((prev) => {
            const nextInventory = prev.inventory.map((item) => {
                if ((item.color || "").trim().toLowerCase() !== oldNormalized) {
                    return item;
                }
                const size = item.size?.trim() || "Standard";
                return {
                    ...item,
                    color: newColor,
                    variantId: `${newColor.toLowerCase().replace(/\s+/g, "-")}-${size.toLowerCase().replace(/\s+/g, "-")}`,
                };
            });
            const nextImages: Record<string, string[]> = {};
            for (const [color, urls] of Object.entries(prev.images)) {
                if (color.trim().toLowerCase() === oldNormalized) {
                    nextImages[newColor] = urls;
                } else {
                    nextImages[color] = urls;
                }
            }
            const nextColors = prev.colors
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((color) => (color.toLowerCase() === oldNormalized ? newColor : color));
            if (!nextColors.some((color) => color.toLowerCase() === newColor.toLowerCase())) {
                nextColors.push(newColor);
            }
            return {
                ...prev,
                inventory: nextInventory,
                images: nextImages,
                colors: Array.from(new Set(nextColors)).join(", "),
            };
        });
        setImageUploadColor((current) =>
            current.trim().toLowerCase() === oldNormalized ? newColor : current,
        );
        cancelRenameColor();
    };
    const handleAddColor = () => {
        const newColor = newColorInput.trim();
        if (!newColor) {
            alert("Enter a color name.");
            return;
        }
        if (editColors.some((color) => color.toLowerCase() === newColor.toLowerCase())) {
            alert(`Color "${newColor}" already exists.`);
            return;
        }
        const sizesToUse = editSizes;
        setEditForm((prev) => {
            const nextInventory = [
                ...prev.inventory,
                ...sizesToUse.map((size) => ({
                    variantId: `${slugifyVariantPart(newColor)}-${slugifyVariantPart(size)}`,
                    color: newColor,
                    size,
                    stock: 0,
                })),
            ];
            const nextColors = prev.colors
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            if (!nextColors.some((color) => color.toLowerCase() === newColor.toLowerCase())) {
                nextColors.push(newColor);
            }
            return {
                ...prev,
                inventory: nextInventory,
                colors: nextColors.join(", "),
                images: {
                    ...prev.images,
                    [newColor]: prev.images[newColor] || [],
                },
                stock: String(
                    nextInventory.reduce((total, item) => total + (Number(item.stock) || 0), 0),
                ),
            };
        });
        setImageUploadColor(newColor);
        setNewColorInput("");
    };
    const handleAddSize = () => {
        const newSize = newSizeInput.trim();
        if (!newSize) {
            alert("Enter a size name.");
            return;
        }
        if (editSizes.some((size) => size.toLowerCase() === newSize.toLowerCase())) {
            alert(`Size "${newSize}" already exists.`);
            return;
        }
        setEditForm((prev) => {
            const nextInventory = [
                ...prev.inventory,
                ...editColors.map((color) => ({
                    variantId: `${slugifyVariantPart(color)}-${slugifyVariantPart(newSize)}`,
                    color,
                    size: newSize,
                    stock: 0,
                })),
            ];
            const nextSizes = prev.sizes
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean);
            if (!nextSizes.some((size) => size.toLowerCase() === newSize.toLowerCase())) {
                nextSizes.push(newSize);
            }
            return {
                ...prev,
                inventory: nextInventory,
                sizes: nextSizes.join(", "),
                stock: String(
                    nextInventory.reduce((total, item) => total + (Number(item.stock) || 0), 0),
                ),
            };
        });
        setNewSizeInput("");
    };
    const handleRemoveSize = (sizeToRemove: string) => {
        const normalized = sizeToRemove.trim().toLowerCase();
        const remainingSizes = editSizes.filter(
            (size) => size.trim().toLowerCase() !== normalized,
        );
        if (remainingSizes.length === 0) {
            alert("At least one size is required.");
            return;
        }
        const confirmed = window.confirm(
            `Remove size "${sizeToRemove}" from all colors?`,
        );
        if (!confirmed) {
            return;
        }
        setEditForm((prev) => {
            const nextInventory = prev.inventory.filter(
                (item) => (item.size || "").trim().toLowerCase() !== normalized,
            );
            const nextSizes = prev.sizes
                .split(",")
                .map((item) => item.trim())
                .filter((size) => size && size.toLowerCase() !== normalized);
            return {
                ...prev,
                inventory: nextInventory,
                sizes: nextSizes.join(", "),
                stock: String(
                    nextInventory.reduce((total, item) => total + (Number(item.stock) || 0), 0),
                ),
            };
        });
    };
    const handleUpdate = async () => {
        if (!editingProduct || !tenantId) {
            return;
        }
        const productId = editingProduct._id || editingProduct.id;
        if (!productId) {
            return;
        }
        const inventory = editForm.inventory
            .map((item) => ({
                variantId: String(item.variantId || "").trim()
                    || `${(item.color || "default").toLowerCase()}-${(item.size || "standard").toLowerCase()}`,
                color: String(item.color || "").trim() || "Default",
                size: String(item.size || "").trim() || "Standard",
                stock: Math.max(0, Number(item.stock) || 0),
            }))
            .filter((item) => item.color && item.size && item.variantId);
        if (inventory.length === 0) {
            alert("At least one color/size variant is required.");
            return;
        }
        const inventoryColors = new Set(
            inventory.map((item) => item.color.trim().toLowerCase()),
        );
        const images = Object.fromEntries(
            Object.entries(editForm.images)
                .map(([color, urls]) => [
                    color.trim() || "Default",
                    urls.filter((url) => typeof url === "string" && url.trim()),
                ] as const)
                .filter(([color, urls]) =>
                    urls.length > 0 && inventoryColors.has(color.toLowerCase()),
                ),
        );
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
                    inventory,
                    images,
                    isActive: editForm.isActive,
                },
            });
            setEditingProduct(null);
        }
        catch (error) {
            console.error("Failed to update product:", error);
            const detail = (
                error as {
                    response?: { data?: { detail?: string | Array<{ msg?: string }> } };
                }
            )?.response?.data?.detail;
            const message = Array.isArray(detail)
                ? detail.map((item) => item.msg).filter(Boolean).join("\n")
                : typeof detail === "string"
                  ? detail
                  : error instanceof Error
                    ? error.message
                    : "Failed to update product.";
            alert(message);
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
        }
        catch (error) {
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
    return (<div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>{tenant.tenantId}</span>
          <h1>Products</h1>
          <p>
            Manage products for <strong>{tenant.name}</strong>
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.secondaryButton} onClick={handleBulkImport}>
            Bulk Import
          </button>
          <button type="button" className={styles.addButton} onClick={handleAddProduct}>
            <span>+</span>
            Add Product
          </button>
        </div>
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
              {products.filter((product) => {
            const stock = product.totalStock ?? product.stock ?? 0;
            return stock > 0 && stock < 10;
        }).length}
            </strong>
          </div>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryIcon}>₹</span>
          <div>
            <span>Inventory Value</span>
            <strong>
              {formatPrice(products.reduce((total, product) => total +
            (product.finalPrice || 0) *
                (product.totalStock ?? product.stock ?? 0), 0))}
            </strong>
          </div>
        </div>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <span className={styles.searchIcon}>⌕</span>
          <input type="text" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search products..."/>
          {searchInput && (<button type="button" className={styles.clearSearch} onClick={() => {
                setSearchInput("");
                setSearch("");
            }}>
              ×
            </button>)}
        </div>
        <div className={styles.selectWrapper}>
          <select className={styles.select} value={category} onChange={(event) => setCategory(event.target.value)}>
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
        {hasFilters && (<button type="button" className={styles.clearButton} onClick={clearFilters}>
            Clear
          </button>)}
      </div>
      {hasFilters && (<div className={styles.activeFilters}>
          <span>Filters:</span>
          {search && <span className={styles.filterTag}>Search: {search}</span>}
          {category && (<span className={styles.filterTag}>Category: {category}</span>)}
        </div>)}
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
        {productsLoading ? (<div className={styles.loading}>Loading products...</div>) : products.length === 0 ? (<div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◫</div>
            <h3>No products found</h3>
            <p>
              {search || category
                ? "Try changing your filters."
                : "Add your first product to start building your store."}
            </p>
            {(search || category) && (<button type="button" className={styles.emptyClearButton} onClick={clearFilters}>
                Clear Filters
              </button>)}
          </div>) : (<div className={styles.tableWrapper}>
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
                return (<tr key={productId}>
                      <td>
                        <div className={styles.product}>
                          <div className={styles.productImage}>
                            <ProductImage
                              src={getFirstProductImage(product.images)}
                              alt={productName}
                              placeholder={productName.charAt(0).toUpperCase()}
                            />
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
                          {(product.discountPercentage || 0) > 0 && (<span>{formatPrice(product.price)}</span>)}
                        </div>
                      </td>
                      <td>
                        <span className={(product.totalStock ?? product.stock ?? 0) <= 0
                        ? styles.lowStock
                        : (product.totalStock ?? product.stock ?? 0) < 10
                            ? styles.lowStock
                            : styles.stock}>
                          {product.totalStock ?? product.stock ?? 0}
                        </span>
                      </td>
                      <td>
                        <span className={product.isActive ? styles.active : styles.inactive}>
                          <span className={styles.statusDot}/>
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
                          <button type="button" className={styles.editButton} onClick={() => handleEdit(product)}>
                            Edit
                          </button>
                          <button type="button" className={styles.deleteButton} onClick={() => setDeleteProduct(product)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>);
            })}
              </tbody>
            </table>
          </div>)}
        {isFetchingNextPage && (<div className={styles.loadingMore}>Loading more products...</div>)}
        {!hasNextPage && products.length > 0 && (<div className={styles.endMessage}>All products loaded</div>)}
      </div>
      {editingProduct && (<div className={styles.modalOverlay} onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    setEditingProduct(null);
                }
            }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <span className={styles.modalEyebrow}>Product</span>
                <h2>Edit Product</h2>
              </div>
              <button type="button" className={styles.modalClose} onClick={() => setEditingProduct(null)}>
                ×
              </button>
            </div>
            <div className={styles.formGrid}>
              <div className={styles.formGroup}>
                <label>Product Name</label>
                <input value={editForm.name} onChange={(event) => setEditForm({
                ...editForm,
                name: event.target.value,
            })}/>
              </div>
              <div className={styles.formGroup}>
                <label>Category</label>
                <input value={editForm.categoryId} onChange={(event) => setEditForm({
                ...editForm,
                categoryId: event.target.value,
            })}/>
              </div>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Description</label>
                <textarea value={editForm.description} onChange={(event) => setEditForm({
                ...editForm,
                description: event.target.value,
            })}/>
              </div>
              <div className={styles.formGroup}>
                <label>Price</label>
                <input type="number" min="0" value={editForm.price} onChange={(event) => setEditForm({
                ...editForm,
                price: event.target.value,
            })}/>
              </div>
              <div className={styles.formGroup}>
                <label>Discount %</label>
                <input type="number" min="0" max="100" value={editForm.discountPercentage} onChange={(event) => setEditForm({
                ...editForm,
                discountPercentage: event.target.value,
            })}/>
              </div>
              <div className={styles.formGroup}>
                <label>Stock</label>
                <input type="number" min="0" value={String(editTotalStock)} disabled/>
              </div>
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Colors & Inventory</label>
                <p className={styles.imageUploadHint}>
                  Add or rename colors/sizes, set stock for each combination, then save.
                </p>
                <div className={styles.variantCreator}>
                  <div className={styles.addColorRow}>
                    <input
                      placeholder="Add color (e.g. Green)"
                      value={newColorInput}
                      onChange={(event) => setNewColorInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddColor();
                        }
                      }}
                    />
                    <button type="button" className={styles.addColorButton} onClick={handleAddColor}>
                      Add color
                    </button>
                  </div>
                  <div className={styles.addColorRow}>
                    <input
                      placeholder="Add size (e.g. M)"
                      value={newSizeInput}
                      onChange={(event) => setNewSizeInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleAddSize();
                        }
                      }}
                    />
                    <button type="button" className={styles.addColorButton} onClick={handleAddSize}>
                      Add size
                    </button>
                  </div>
                </div>
                <div className={styles.colorChips}>
                  {editColors.map((color) => (
                    <span key={color} className={styles.colorChip}>
                      {editingColorName === color ? (
                        <>
                          <input
                            className={styles.colorRenameInput}
                            value={colorRenameValue}
                            onChange={(event) => setColorRenameValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                saveRenameColor();
                              }
                              if (event.key === "Escape") {
                                cancelRenameColor();
                              }
                            }}
                            autoFocus
                          />
                          <button
                            type="button"
                            className={styles.colorChipEdit}
                            onClick={saveRenameColor}
                            title="Save color name"
                          >
                            ✓
                          </button>
                          <button
                            type="button"
                            className={styles.colorChipRemove}
                            onClick={cancelRenameColor}
                            title="Cancel"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <>
                          {color}
                          <button
                            type="button"
                            className={styles.colorChipEdit}
                            onClick={() => startRenameColor(color)}
                            aria-label={`Edit ${color}`}
                            title={`Edit ${color}`}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            className={styles.colorChipRemove}
                            onClick={() => handleRemoveColor(color)}
                            aria-label={`Remove ${color}`}
                            title={`Remove ${color}`}
                          >
                            ×
                          </button>
                        </>
                      )}
                    </span>
                  ))}
                </div>
                <div className={styles.colorChips}>
                  {editSizes.map((size) => (
                    <span key={size} className={styles.colorChip}>
                      {size}
                      <button
                        type="button"
                        className={styles.colorChipRemove}
                        onClick={() => handleRemoveSize(size)}
                        aria-label={`Remove ${size}`}
                        title={`Remove ${size}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className={styles.inventorySection}>
                  <div className={styles.inventoryHeader}>
                    <strong>Inventory</strong>
                    <span>Total stock: {editTotalStock}</span>
                  </div>
                  <div className={styles.inventoryTableWrapper}>
                    <table className={styles.inventoryTable}>
                      <thead>
                        <tr>
                          <th>Color</th>
                          {editSizes.map((size) => (
                            <th key={size}>{size}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {editColors.map((color) => (
                          <tr key={color}>
                            <td>
                              <strong>{color}</strong>
                            </td>
                            {editSizes.map((size) => (
                              <td key={`${color}-${size}`}>
                                <input
                                  type="number"
                                  min="0"
                                  value={getInventoryStock(color, size)}
                                  onChange={(event) =>
                                    handleStockChange(color, size, event.target.value)
                                  }
                                  aria-label={`${color} ${size} stock`}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              
              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label>Product Images</label>
                <p className={styles.imageUploadHint}>
                  Upload images per color. Colors must match the product inventory colors.
                </p>
                <div className={styles.imageColorRow}>
                  <label htmlFor="edit-image-color">Color</label>
                  <select
                    id="edit-image-color"
                    value={imageUploadColor}
                    onChange={(event) => setImageUploadColor(event.target.value)}
                  >
                    {editColors.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                </div>
                <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" multiple onChange={handleImageSelect} className={styles.hiddenFileInput}/>
                <div className={styles.imageUploadBox}>
                  <button type="button" className={styles.chooseImageButton} onClick={() => imageInputRef.current?.click()}>
                    <span className={styles.uploadIcon}>＋</span>
                    Choose Images for {imageUploadColor}
                  </button>
                  <span className={styles.imageUploadText}>
                    PNG, JPG, JPEG or WEBP
                  </span>
                </div>
                {Object.entries(editForm.images).map(([color, urls]) => (
                  <div key={color} className={styles.imageColorGroup}>
                    <strong>{color}</strong>
                    <div className={styles.imagePreviewGrid}>
                      {urls.map((image, index) => (
                        <div key={`${color}-${image.slice(0, 30)}-${index}`} className={styles.imagePreview}>
                          <img src={image} alt={`${color} ${index + 1}`}/>
                          <button type="button" className={styles.removeImageButton} onClick={() => handleRemoveImage(color, index)}>
                            ×
                          </button>
                          <span className={styles.imageNumber}>{index + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <label className={styles.activeToggle}>
                <input type="checkbox" checked={editForm.isActive} onChange={(event) => setEditForm({
                ...editForm,
                isActive: event.target.checked,
            })}/>
                <span>Product Active</span>
              </label>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelButton} onClick={() => setEditingProduct(null)}>
                Cancel
              </button>
              <button type="button" className={styles.saveButton} onClick={handleUpdate} disabled={updateProductMutation.isPending}>
                {updateProductMutation.isPending ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>)}
      {deleteProduct && (<div className={styles.modalOverlay} onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                    setDeleteProduct(null);
                }
            }}>
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
              <button type="button" className={styles.cancelButton} onClick={() => setDeleteProduct(null)}>
                Cancel
              </button>
              <button type="button" className={styles.confirmDeleteButton} onClick={handleDelete} disabled={deleteProductMutation.isPending}>
                {deleteProductMutation.isPending
                ? "Deleting..."
                : "Delete Product"}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
