import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { uploadImageToS3 } from "../api/upload.api";
import { useCreateProduct } from "../hooks/useTenantProducts";
import { useTenantByTenantId } from "../hooks/useTenants";
import type { ProductImageRef } from "../utils/s3Image";
import { hasUnresolvedImageRefs, imageRefsToKeys } from "../utils/s3Image";
import { PRODUCT_MEDIA_ACCEPT, isAllowedProductMediaFile, isVideoSrc } from "../../../utils/mediaSrc";
import type { TaxStatus } from "../api/tax.api";
import {
    SERVICE_DEFAULT_COLOR,
    SERVICE_DEFAULT_SIZE,
    isMenuBusiness,
    isServiceBusiness,
} from "../../tenant/businessMode";
import styles from "../styles/CreateProduct.module.css";
interface InventoryRow {
    variantId: string;
    color: string;
    size: string;
    stock: string;
}
interface ColorImages {
    [color: string]: ProductImageRef[];
}

type DuplicateProductNotice = {
    productId: string;
    name: string;
    categoryName?: string;
    message: string;
};

function parseDuplicateProductError(error: unknown): DuplicateProductNotice | null {
    if (!axios.isAxiosError(error)) {
        return null;
    }
    const detail = error.response?.data?.detail;
    if (detail && typeof detail === "object" && detail.code === "PRODUCT_ALREADY_EXISTS") {
        return {
            productId: String(detail.productId || ""),
            name: String(detail.name || ""),
            categoryName: String(detail.categoryName || detail.categoryId || ""),
            message: String(
                detail.message
                || "This product is already in this category. Edit or update it instead of creating it again.",
            ),
        };
    }
    return null;
}

function createProductErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === "string") {
            return detail;
        }
        if (Array.isArray(detail)) {
            return detail
                .map((item) => (typeof item === "object" && item?.msg ? item.msg : String(item)))
                .join(" ");
        }
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Failed to create product.";
}
export default function CreateProduct() {
    const navigate = useNavigate();
    const { tenantId } = useParams();
    const { data: tenant } = useTenantByTenantId(tenantId || "");
    const isServiceMode = isServiceBusiness(tenant?.businessType);
    const isMenuMode = isMenuBusiness(tenant?.businessType);
    const isSimpleListing = isServiceMode;
    const defaultListingColor = SERVICE_DEFAULT_COLOR;
    const defaultListingSize = SERVICE_DEFAULT_SIZE;
    const createProductMutation = useCreateProduct();
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [imageUploadColor, setImageUploadColor] = useState("");
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [brand, setBrand] = useState("");
    const [location, setLocation] = useState("");
    const [foodType, setFoodType] = useState<"" | "veg" | "non_veg">("");
    const [basePrice, setBasePrice] = useState("");
    const [marginPercentage, setMarginPercentage] = useState("");
    const [discountPercentage, setDiscountPercentage] = useState("");
    const [taxStatus, setTaxStatus] = useState<TaxStatus>("taxable");
    const [hsnSac, setHsnSac] = useState("");
    const [taxRate, setTaxRate] = useState("");
    const [cessRate, setCessRate] = useState("0");
    const [serviceAvailable, setServiceAvailable] = useState(true);
    const [colors, setColors] = useState<string[]>([]);
    const [sizes, setSizes] = useState<string[]>([]);
    const [newColor, setNewColor] = useState("");
    const [newSize, setNewSize] = useState("");
    const [inventory, setInventory] = useState<InventoryRow[]>([]);
    const [colorImages, setColorImages] = useState<ColorImages>({});
    const [isUploadingImages, setIsUploadingImages] = useState(false);
    const [error, setError] = useState("");
    const [duplicateNotice, setDuplicateNotice] = useState<DuplicateProductNotice | null>(null);
    const basePriceNumber = Number(basePrice) || 0;
    const marginNumber = Number(marginPercentage) || 0;
    const discountNumber = isServiceMode ? 0 : Number(discountPercentage) || 0;
    const calculatedPrice = basePriceNumber + (basePriceNumber * marginNumber) / 100;
    const finalPrice = calculatedPrice - (calculatedPrice * discountNumber) / 100;

    useEffect(() => {
        if (!isSimpleListing) {
            return;
        }
        if (isServiceMode) {
            setDiscountPercentage("");
        }
        setColors([defaultListingColor]);
        setSizes([defaultListingSize]);
        setInventory([
            {
                variantId: "standard-one-size",
                color: defaultListingColor,
                size: defaultListingSize,
                stock: serviceAvailable ? "1" : "0",
            },
        ]);
        setImageUploadColor(defaultListingColor);
    }, [
        defaultListingColor,
        defaultListingSize,
        isServiceMode,
        isSimpleListing,
        serviceAvailable,
    ]);
    const createVariantId = (color: string, size: string) => {
        return `${color}-${size}`
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    };
    const getInventoryRow = (color: string, size: string) => {
        return inventory.find((item) => item.color === color && item.size === size);
    };
    const handleAddColor = () => {
        const color = newColor.trim();
        if (!color) {
            return;
        }
        const exists = colors.some((item) => item.toLowerCase() === color.toLowerCase());
        if (exists) {
            setError("This color has already been added.");
            return;
        }
        setError("");
        setColors((previous) => [...previous, color]);
        setNewColor("");
        setInventory((previous) => {
            const updated = [...previous];
            sizes.forEach((size) => {
                const exists = updated.some((item) => item.color === color && item.size === size);
                if (!exists) {
                    updated.push({
                        variantId: createVariantId(color, size),
                        color,
                        size,
                        stock: "0",
                    });
                }
            });
            return updated;
        });
    };
    const handleRemoveColor = (color: string) => {
        setColors((previous) => previous.filter((item) => item !== color));
        setInventory((previous) => previous.filter((item) => item.color !== color));
        setColorImages((previous) => {
            const updated = { ...previous };
            delete updated[color];
            return updated;
        });
    };
    const handleAddSize = () => {
        const size = newSize.trim();
        if (!size) {
            return;
        }
        const exists = sizes.some((item) => item.toLowerCase() === size.toLowerCase());
        if (exists) {
            setError("This size has already been added.");
            return;
        }
        setError("");
        setSizes((previous) => [...previous, size]);
        setNewSize("");
        setInventory((previous) => {
            const updated = [...previous];
            colors.forEach((color) => {
                const exists = updated.some((item) => item.color === color && item.size === size);
                if (!exists) {
                    updated.push({
                        variantId: createVariantId(color, size),
                        color,
                        size,
                        stock: "0",
                    });
                }
            });
            return updated;
        });
    };
    const handleRemoveSize = (size: string) => {
        setSizes((previous) => previous.filter((item) => item !== size));
        setInventory((previous) => previous.filter((item) => item.size !== size));
    };
    const handleStockChange = (color: string, size: string, value: string) => {
        setInventory((previous) => previous.map((item) => item.color === color && item.size === size
            ? {
                ...item,
                stock: value,
            }
            : item));
    };
    const handleImageSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        if (!files.length || !imageUploadColor) {
            return;
        }
        if (!tenantId) {
            setError("Tenant ID is missing.");
            return;
        }
        setError("");
        const validFiles = files.filter((file) => isAllowedProductMediaFile(file));
        if (validFiles.length !== files.length) {
            setError("Use images up to 10 MB or videos up to 50 MB (MP4/WebM).");
        }
        if (!validFiles.length) {
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            return;
        }
        setIsUploadingImages(true);
        try {
            const uploadedImages = await Promise.all(
                validFiles.map(async (file) => {
                    const uploaded = await uploadImageToS3(file, tenantId, "products");
                    return {
                        key: uploaded.key,
                        previewUrl: uploaded.url,
                        name: file.name,
                    } satisfies ProductImageRef;
                }),
            );
            setColorImages((previous) => ({
                ...previous,
                [imageUploadColor]: [
                    ...(previous[imageUploadColor] || []),
                    ...uploadedImages,
                ],
            }));
        }
        catch (imageError) {
            console.error("Failed to upload images:", imageError);
            const detail = axios.isAxiosError(imageError)
                ? imageError.response?.data?.detail
                : null;
            setError(
                typeof detail === "string"
                    ? detail
                    : "Failed to upload selected images to S3.",
            );
        }
        finally {
            setIsUploadingImages(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };
    const handleChooseImages = (color: string) => {
        setImageUploadColor(color);
        setTimeout(() => {
            fileInputRef.current?.click();
        }, 0);
    };
    const handleRemoveColorImage = (color: string, index: number) => {
        setColorImages((previous) => ({
            ...previous,
            [color]: (previous[color] || []).filter((_, imageIndex) => imageIndex !== index),
        }));
    };
    const handleSetPrimaryImage = (color: string, index: number) => {
        if (index === 0) {
            return;
        }
        setColorImages((previous) => {
            const updated = [...(previous[color] || [])];
            const [selectedImage] = updated.splice(index, 1);
            updated.unshift(selectedImage);
            return {
                ...previous,
                [color]: updated,
            };
        });
    };
    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        // "Save as draft" submits with value="draft": saved but hidden until published.
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const isDraft = submitter?.value === "draft";
        setError("");
        setDuplicateNotice(null);
        if (!tenantId) {
            setError("Tenant ID is missing.");
            return;
        }
        if (!name.trim()) {
            setError("Product name is required.");
            return;
        }
        if (!description.trim()) {
            setError("Product description is required.");
            return;
        }
        if (!categoryId.trim()) {
            setError("Category is required.");
            return;
        }
        if (isServiceMode && !location.trim()) {
            setError("Service location is required.");
            return;
        }
        if (isMenuMode && !foodType) {
            setError("Select Veg or Non-Veg.");
            return;
        }
        if (!basePrice || Number(basePrice) <= 0) {
            setError("Enter a valid base price.");
            return;
        }
        if (marginPercentage &&
            (Number(marginPercentage) < 0 || Number(marginPercentage) > 1000)) {
            setError("Margin must be between 0 and 1000.");
            return;
        }
        if (!isServiceMode && discountPercentage &&
            (Number(discountPercentage) < 0 || Number(discountPercentage) > 100)) {
            setError("Discount must be between 0 and 100.");
            return;
        }
        // Caught before saving rather than at checkout: the server would reject
        // an out-of-range rate anyway, and a silently wrong rate mis-states the
        // tax on every future invoice for this product.
        if (taxStatus === "taxable" && taxRate !== "" &&
            (Number(taxRate) < 0 || Number(taxRate) > 100)) {
            setError("GST rate must be between 0 and 100.");
            return;
        }
        if (cessRate && (Number(cessRate) < 0 || Number(cessRate) > 100)) {
            setError("Cess rate must be between 0 and 100.");
            return;
        }
        if (isSimpleListing) {
            if (!colorImages[defaultListingColor]?.length) {
                setError("Please upload at least one image.");
                return;
            }
            if (hasUnresolvedImageRefs(colorImages)) {
                setError("Some images failed to upload to S3. Remove them and try again.");
                return;
            }
            const stock = serviceAvailable ? 1 : 0;
            try {
                await createProductMutation.mutateAsync({
                    tenantId,
                    name: name.trim(),
                    description: description.trim(),
                    categoryId: categoryId.trim(),
                    location: isServiceMode
                        ? location.trim()
                        : undefined,
                    foodType: isMenuMode
                        ? foodType || undefined
                        : undefined,
                    isDraft,
                    basePrice: Number(basePrice),
                    marginPercentage: Number(marginPercentage) || 0,
                    price: calculatedPrice,
                    discountPercentage: discountNumber,
                    tax: {
                        taxStatus,
                        hsnSac: hsnSac.trim() || undefined,
                        // A non-taxable classification carries no rate at all,
                        // rather than a misleading zero.
                        taxRate:
                            taxStatus === "taxable" && taxRate !== ""
                                ? Number(taxRate)
                                : undefined,
                        cessRate: Number(cessRate) || 0,
                    },
                    finalPrice,
                    stock,
                    sizes: [defaultListingSize],
                    colors: [defaultListingColor],
                    inventory: [
                        {
                            variantId: "standard-one-size",
                            color: defaultListingColor,
                            size: defaultListingSize,
                            stock,
                        },
                    ],
                    images: imageRefsToKeys(colorImages),
                });
                navigate(`/admin/tenants/${tenantId}/products`);
            }
            catch (createError) {
                const duplicate = parseDuplicateProductError(createError);
                if (duplicate) {
                    setDuplicateNotice(duplicate);
                    return;
                }
                console.error("Failed to create product:", createError);
                setError(createProductErrorMessage(createError));
            }
            return;
        }
        if (!colors.length) {
            setError("Add at least one color.");
            return;
        }
        if (!sizes.length) {
            setError("Add at least one size.");
            return;
        }
        for (const item of inventory) {
            const stockValue = Number(item.stock);
            if (!item.variantId || !item.color || !item.size) {
                setError("Every inventory variant must have a color and size.");
                return;
            }
            if (Number.isNaN(stockValue) || stockValue < 0) {
                setError(`Enter a valid stock for ${item.color} - ${item.size}.`);
                return;
            }
        }
        for (const color of colors) {
            for (const size of sizes) {
                const row = getInventoryRow(color, size);
                if (!row) {
                    setError(`Missing inventory for ${color} - ${size}.`);
                    return;
                }
            }
        }
        for (const color of colors) {
            if (!colorImages[color] || colorImages[color].length === 0) {
                setError(`Please upload at least one image for ${color}.`);
                return;
            }
        }
        if (hasUnresolvedImageRefs(colorImages)) {
            setError("Some images failed to upload to S3. Remove them and try again.");
            return;
        }
        const inventoryPayload = inventory.map((item) => ({
            variantId: item.variantId,
            color: item.color,
            size: item.size,
            stock: Number(item.stock),
        }));
        try {
            await createProductMutation.mutateAsync({
                tenantId,
                name: name.trim(),
                description: description.trim(),
                categoryId: categoryId.trim(),
                brand: isMenuMode ? undefined : brand.trim() || undefined,
                foodType: isMenuMode ? foodType || undefined : undefined,
                isDraft,
                basePrice: Number(basePrice),
                marginPercentage: Number(marginPercentage) || 0,
                price: calculatedPrice,
                discountPercentage: Number(discountPercentage) || 0,
                tax: {
                    taxStatus,
                    hsnSac: hsnSac.trim() || undefined,
                    taxRate:
                        taxStatus === "taxable" && taxRate !== ""
                            ? Number(taxRate)
                            : undefined,
                    cessRate: Number(cessRate) || 0,
                },
                finalPrice,
                stock: inventoryPayload.reduce((total, item) => total + item.stock, 0),
                sizes,
                colors,
                inventory: inventoryPayload,
                images: imageRefsToKeys(colorImages),
            });
            navigate(`/admin/tenants/${tenantId}/products`);
        }
        catch (error) {
            const duplicate = parseDuplicateProductError(error);
            if (duplicate) {
                setDuplicateNotice(duplicate);
                return;
            }
            console.error("Failed to create product:", error);
            setError(createProductErrorMessage(error));
        }
    };
    const handleBack = () => {
        if (tenantId) {
            navigate(`/admin/tenants/${tenantId}/products`);
        }
        else {
            navigate("/admin/tenants");
        }
    };
    const totalStock = inventory.reduce((total, item) => total + (Number(item.stock) || 0), 0);
    return (<div className={styles.page}>
      

      <div className={styles.header}>
        <div>
          <button type="button" className={styles.backButton} onClick={handleBack}>
            <span className={styles.backIcon}>←</span>
            Back to Products
          </button>

          <span className={styles.eyebrow}>{tenantId || "TENANT"}</span>

          <h1>Create Product</h1>

          <p>Add a new product to this tenant&apos;s store.</p>
        </div>
      </div>

      

      <form className={styles.formCard} onSubmit={handleSubmit}>
        

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Product Information</h2>

              <p>Enter the basic information about your product.</p>
            </div>
          </div>

          <div className={styles.grid}>
            

            <div className={`${styles.field} ${styles.full}`}>
              <label htmlFor="product-name">
                Product Name
                <span>*</span>
              </label>

              <input id="product-name" type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Example: Premium Cotton Kurti"/>
            </div>

            

            <div className={`${styles.field} ${styles.full}`}>
              <label htmlFor="product-description">
                Description
                <span>*</span>
              </label>

              <textarea id="product-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe your product..." rows={5}/>
            </div>

            

            <div className={styles.field}>
              <label htmlFor="category">
                Category
                <span>*</span>
              </label>

              <input id="category" type="text" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Example: WOMENS_FASHION"/>

              <small>Enter the category ID.</small>
            </div>

            <div className={styles.field}>
              {isServiceMode ? (
                <>
                  <label htmlFor="service-location">
                    Location
                    <span>*</span>
                  </label>
                  <input
                    id="service-location"
                    type="text"
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                    placeholder="Example: Bengaluru, Room 204, Spa Wing"
                  />
                  <small>Where this service is available or delivered.</small>
                </>
              ) : isMenuMode ? (
                <>
                  <label htmlFor="food-type">
                    Food Type
                    <span>*</span>
                  </label>
                  <select
                    id="food-type"
                    value={foodType}
                    onChange={(event) =>
                      setFoodType(
                        event.target.value as "" | "veg" | "non_veg",
                      )
                    }
                  >
                    <option value="">Select Veg or Non-Veg</option>
                    <option value="veg">Veg</option>
                    <option value="non_veg">Non-Veg</option>
                  </select>
                  <small>Used to identify vegetarian and non-vegetarian items.</small>
                </>
              ) : (
                <>
                  <label htmlFor="product-brand">Brand</label>
                  <input
                    id="product-brand"
                    type="text"
                    value={brand}
                    onChange={(event) => setBrand(event.target.value)}
                    placeholder="Example: Levi's, Tanishq, Nike"
                  />
                  <small>Optional. Used in storefront filters and product details.</small>
                </>
              )}
            </div>

            

            <div className={styles.field}>
              <label htmlFor="tenant">Tenant</label>

              <input id="tenant" type="text" value={tenantId || ""} disabled/>

              <small>Product will be created for this tenant.</small>
            </div>
          </div>
        </section>

        

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Pricing</h2>

              <p>Set the base price, margin and customer discount.</p>
            </div>
          </div>

          <div className={styles.grid}>
            

            <div className={styles.field}>
              <label htmlFor="base-price">
                Base Price
                <span>*</span>
              </label>

              <div className={styles.inputWithPrefix}>
                <span>₹</span>

                <input id="base-price" type="number" min="0" step="0.01" value={basePrice} onChange={(event) => setBasePrice(event.target.value)} placeholder="100.00"/>
              </div>

              <small>Cost/base price of the product.</small>
            </div>

            

            <div className={styles.field}>
              <label htmlFor="margin">
                Margin
                <span>*</span>
              </label>

              <div className={styles.inputWithSuffix}>
                <input id="margin" type="number" min="0" step="0.01" value={marginPercentage} onChange={(event) => setMarginPercentage(event.target.value)} placeholder="30"/>

                <span>%</span>
              </div>

              <small>Example: ₹100 + 30% = ₹130.</small>
            </div>

            

            <div className={styles.pricePreview}>
              <span>Calculated Price</span>

              <strong>
                ₹
                {calculatedPrice.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}
              </strong>
            </div>

            

            <div className={styles.field}>
              <label htmlFor="discount">Discount</label>

              <div className={styles.inputWithSuffix}>
                <input id="discount" type="number" min="0" max="100" step="0.01" value={discountPercentage} onChange={(event) => setDiscountPercentage(event.target.value)} placeholder="0" disabled={isServiceMode}/>

                <span>%</span>
              </div>

              <small>
                {isServiceMode
                  ? "Not used for service listings."
                  : "Optional customer discount."}
              </small>
            </div>

            <div className={styles.field}>
              <label htmlFor="taxStatus">Tax status</label>

              <select
                id="taxStatus"
                value={taxStatus}
                onChange={(event) =>
                  setTaxStatus(event.target.value as TaxStatus)
                }
              >
                <option value="taxable">Taxable</option>
                <option value="exempt">Exempt</option>
                <option value="nil_rated">Nil rated</option>
                <option value="non_gst">Non-GST</option>
              </select>

              <small>
                Exempt, nil rated and non-GST are reported separately on a GST
                return, so they are listed apart rather than as a zero rate.
              </small>
            </div>

            <div className={styles.field}>
              <label htmlFor="hsnSac">
                {isServiceMode ? "SAC code" : "HSN code"}
              </label>

              <input
                id="hsnSac"
                value={hsnSac}
                onChange={(event) => setHsnSac(event.target.value)}
                placeholder={isServiceMode ? "998314" : "9004"}
              />

              <small>Printed on the tax invoice. Confirm with your CA.</small>
            </div>

            {taxStatus === "taxable" && (
              <>
                <div className={styles.field}>
                  <label htmlFor="taxRate">GST rate</label>

                  <div className={styles.inputWithSuffix}>
                    <input
                      id="taxRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={taxRate}
                      onChange={(event) => setTaxRate(event.target.value)}
                      placeholder="18"
                    />

                    <span>%</span>
                  </div>

                  <small>Leave blank to use the store's default rate.</small>
                </div>

                <div className={styles.field}>
                  <label htmlFor="cessRate">Cess rate</label>

                  <div className={styles.inputWithSuffix}>
                    <input
                      id="cessRate"
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={cessRate}
                      onChange={(event) => setCessRate(event.target.value)}
                      placeholder="0"
                    />

                    <span>%</span>
                  </div>

                  <small>Compensation cess, only on goods that attract it.</small>
                </div>
              </>
            )}

            

            <div className={styles.pricePreview}>
              <span>Final Selling Price</span>

              <strong>
                ₹
                {finalPrice.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}
              </strong>
            </div>
          </div>
        </section>

        

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>{isSimpleListing ? "Availability" : "Product Variants"}</h2>

              <p>
                {isServiceMode
                  ? "Services do not use color, size, discount, or quantity. Mark the listing available or unavailable."
                  : "Add colors and sizes. Stock is maintained separately for each combination."}
              </p>
            </div>
          </div>

          {isSimpleListing ? (
            <div className={styles.field}>
              <label htmlFor="listing-availability">Status</label>
              <select
                id="listing-availability"
                value={serviceAvailable ? "available" : "unavailable"}
                onChange={(event) =>
                  setServiceAvailable(event.target.value === "available")
                }
              >
                <option value="available">Available</option>
                <option value="unavailable">Unavailable</option>
              </select>
              <small>
                Customers see Available or Unavailable — no variants.
              </small>
            </div>
          ) : (
            <>
          <div className={styles.variantCreator}>
            

            <div className={styles.field}>
              <label htmlFor="new-color">Add Color</label>

              <div className={styles.variantInputRow}>
                <input
                  id="new-color"
                  name="product-variant-color"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={newColor}
                  onChange={(event) => setNewColor(event.target.value)}
                  onKeyDown={(event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleAddColor();
            }
        }}
                  placeholder="e.g. Red"
                />

                <button type="button" className={styles.addVariantButton} onClick={handleAddColor}>
                  + Add
                </button>
              </div>
            </div>

            

            <div className={styles.field}>
              <label htmlFor="new-size">Add Size</label>

              <div className={styles.variantInputRow}>
                <input
                  id="new-size"
                  name="product-variant-size"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  value={newSize}
                  onChange={(event) =>
                    setNewSize(event.target.value.replace(/[/\\]/g, ""))
                  }
                  onKeyDown={(event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                handleAddSize();
            }
        }}
                  placeholder="e.g. M"
                />

                <button type="button" className={styles.addVariantButton} onClick={handleAddSize}>
                  + Add
                </button>
              </div>
            </div>
          </div>

          

          {colors.length > 0 && (<div className={styles.selectedVariants}>
              <strong>Colors</strong>

              <div className={styles.variantTags}>
                {colors.map((color) => (<span key={color} className={styles.variantTag}>
                    {color}

                    <button type="button" onClick={() => handleRemoveColor(color)} aria-label={`Remove ${color}`}>
                      ×
                    </button>
                  </span>))}
              </div>
            </div>)}

          

          {sizes.length > 0 && (<div className={styles.selectedVariants}>
              <strong>Sizes</strong>

              <div className={styles.variantTags}>
                {sizes.map((size) => (<span key={size} className={styles.variantTag}>
                    {size}

                    <button type="button" onClick={() => handleRemoveSize(size)} aria-label={`Remove ${size}`}>
                      ×
                    </button>
                  </span>))}
              </div>
            </div>)}

          

          {colors.length > 0 && sizes.length > 0 && (<div className={styles.inventorySection}>
              <div className={styles.inventoryHeader}>
                <div>
                  <h3>Inventory</h3>

                  <p>Enter stock for each color and size.</p>
                </div>

                <strong>Total Stock: {totalStock}</strong>
              </div>

              <div className={styles.inventoryTableWrapper}>
                <table className={styles.inventoryTable}>
                  <thead>
                    <tr>
                      <th>Color</th>

                      {sizes.map((size) => (<th key={size}>{size}</th>))}
                    </tr>
                  </thead>

                  <tbody>
                    {colors.map((color) => (<tr key={color}>
                        <td>
                          <strong>{color}</strong>
                        </td>

                        {sizes.map((size) => {
                    const row = getInventoryRow(color, size);
                    return (<td key={size}>
                              <input type="number" min="0" value={row?.stock ?? "0"} onChange={(event) => handleStockChange(color, size, event.target.value)}/>
                            </td>);
                })}
                      </tr>))}
                  </tbody>
                </table>
              </div>
            </div>)}
            </>
          )}
        </section>

        

        {colors.length > 0 && (<section className={styles.section}>
            <div className={styles.sectionHeader}>
              <div>
                <h2>Product Images</h2>

                <p>
                  {isServiceMode
                    ? "Photo 1 is the card. Photo 2 shows on hover. Video is optional on the listing page."
                    : "Photo 1 is the card. Photo 2 shows on hover. Video is optional on the product page."}
                </p>
              </div>
            </div>

            <input ref={fileInputRef} type="file" accept={PRODUCT_MEDIA_ACCEPT} multiple onChange={handleImageSelect} className={styles.imageFileInput}/>

            <div className={styles.mediaUploadWrap}>
            {isUploadingImages && (
              <div className={styles.uploadOverlay} role="status" aria-live="polite">
                <span className={styles.uploadSpinner} />
                Uploading…
              </div>
            )}
            <div className={styles.colorImageSections}>
              {colors.map((color) => {
                const images = colorImages[color] || [];
                return (<div key={color} className={styles.colorImageSection}>
                    <div className={styles.colorImageHeader}>
                      <div>
                        <h3>
                          {isSimpleListing ? "Listing images" : color}
                        </h3>

                        <p>
                          {images.length > 0
                        ? `${images.length} ${images.length === 1 ? "image" : "images"}`
                        : "No images uploaded"}
                        </p>
                      </div>

                      <button type="button" className={styles.chooseImageButton} onClick={() => handleChooseImages(color)} disabled={isUploadingImages}>
                        {isUploadingImages && imageUploadColor === color ? "Uploading..." : "+ Add media"}
                      </button>
                    </div>

                    {images.length > 0 && (<div className={styles.imageGrid}>
                        {images.map((image, index) => (<div className={`${styles.imageCard} ${index === 0 ? styles.primaryImageCard : ""}`} key={`${image.key}-${index}`}>
                            <div className={styles.imageWrapper}>
                              {isVideoSrc(image.previewUrl || image.key) ? (
                                <video src={image.previewUrl} muted playsInline />
                              ) : (
                                <img src={image.previewUrl} alt={image.name || `${color} image ${index + 1}`}/>
                              )}

                              {index === 0 && (<span className={styles.primaryBadge}>
                                  Primary
                                </span>)}

                              <button type="button" className={styles.removeImageButton} onClick={() => handleRemoveColorImage(color, index)} aria-label={`Remove ${image.name || "image"}`}>
                                ×
                              </button>
                            </div>

                            <div className={styles.imageInfo}>
                              <span className={styles.imageName} title={image.name}>
                                {image.name || `Image ${index + 1}`}
                              </span>

                              {index !== 0 && (<button type="button" className={styles.primaryButton} onClick={() => handleSetPrimaryImage(color, index)}>
                                  Set as primary
                                </button>)}
                            </div>
                          </div>))}
                      </div>)}

                    <small className={styles.imageHelp}>
                      Photo 1 is the card. Photo 2 shows on hover.
                    </small>
                  </div>);
            })}
            </div>
            </div>
          </section>)}

        

        {error && (<div className={styles.error}>
            <span className={styles.errorIcon}>!</span>

            <span>{error}</span>
          </div>)}

        

        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={handleBack} disabled={createProductMutation.isPending || isUploadingImages}>
            Cancel
          </button>

          <button type="submit" value="draft" className={styles.cancelButton} disabled={createProductMutation.isPending || isUploadingImages} title="Save now, publish later from the products list">
            Save as draft
          </button>

          <button type="submit" value="publish" className={styles.createButton} disabled={createProductMutation.isPending || isUploadingImages}>
            {createProductMutation.isPending ? (<>
                <span className={styles.spinner}/>
                Creating...
              </>) : ("Create Product")}
          </button>
        </div>
      </form>
      {duplicateNotice ? (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="duplicate-product-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDuplicateNotice(null);
            }
          }}
        >
          <div className={styles.duplicateModal}>
            <h2 id="duplicate-product-title">Product already exists</h2>
            <p>
              {duplicateNotice.message}
            </p>
            <p className={styles.duplicateMeta}>
              <strong>{duplicateNotice.name || name.trim()}</strong>
              {duplicateNotice.categoryName
                ? ` in ${duplicateNotice.categoryName}`
                : categoryId.trim()
                  ? ` in ${categoryId.trim()}`
                  : ""}
            </p>
            <div className={styles.duplicateActions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => setDuplicateNotice(null)}
              >
                Stay here
              </button>
              {duplicateNotice.productId && tenantId ? (
                <button
                  type="button"
                  className={styles.createButton}
                  onClick={() =>
                    navigate(
                      `/admin/tenants/${tenantId}/products?edit=${duplicateNotice.productId}`,
                    )
                  }
                >
                  Edit existing product
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>);
}
