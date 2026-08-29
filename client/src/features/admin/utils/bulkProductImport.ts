import * as XLSX from "xlsx";
import JSZip from "jszip";

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|svg)$/i;

export interface BulkInventoryItem {
    variantId: string;
    color: string;
    size: string;
    stock: number;
}

export interface BulkProductDraft {
    key: string;
    productId?: string;
    name: string;
    description: string;
    categoryId: string;
    categoryName?: string;
    brand?: string;
    price: number;
    discountPercentage: number;
    inventory: BulkInventoryItem[];
    imagePathsByColor: Record<string, string[]>;
    images: Record<string, string[]>;
    rowNumbers: number[];
    errors: string[];
}

export interface ParsedBulkImport {
    products: BulkProductDraft[];
    parseErrors: string[];
}

const HEADER_ALIASES: Record<string, string> = {
    productid: "productId",
    id: "productId",
    name: "name",
    productname: "name",
    description: "description",
    desc: "description",
    categoryid: "categoryId",
    category: "categoryId",
    categoryname: "categoryName",
    brand: "brand",
    price: "price",
    discount: "discountPercentage",
    discountpercentage: "discountPercentage",
    discountpercent: "discountPercentage",
    color: "color",
    size: "size",
    stock: "stock",
    quantity: "stock",
    qty: "stock",
    variantid: "variantId",
    imagepath: "imagePath",
    imageurl: "imagePath",
    image: "imagePath",
    localpath: "imagePath",
    filepath: "imagePath",
    photopath: "imagePath",
    isactive: "isActive",
    active: "isActive",
};

const normalizeHeader = (header: string) => header.trim().toLowerCase().replace(/\s+/g, "");

const isImageColumnHeader = (header: string) => {
    const normalized = normalizeHeader(header);
    if (HEADER_ALIASES[normalized] === "imagePath") {
        return true;
    }
    return /^image(path|url|localpath|filepath|photopath)\d*$/.test(normalized);
};

const mapRowHeaders = (row: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {};
    const imagePaths: string[] = [];

    Object.entries(row).forEach(([header, value]) => {
        if (isImageColumnHeader(header)) {
            imagePaths.push(...splitImagePaths(value));
            return;
        }
        const normalized = normalizeHeader(String(header));
        const field = HEADER_ALIASES[normalized];
        if (field) {
            mapped[field] = value;
        }
    });

    if (imagePaths.length) {
        mapped.imagePaths = imagePaths;
    }

    return mapped;
};

export const createVariantId = (color: string, size: string) => {
    return `${color}-${size}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
};

export const basenameFromPath = (pathValue: string) => {
    const normalized = pathValue.replace(/\\/g, "/");
    const parts = normalized.split("/").filter(Boolean);
    return parts[parts.length - 1]?.trim() || pathValue.trim();
};

export const isRemoteImageUrl = (value: string) => /^https?:\/\//i.test(value.trim());

export const isDataUrl = (value: string) => /^data:image\//i.test(value.trim());

export const looksLikeLocalPath = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || isRemoteImageUrl(trimmed) || isDataUrl(trimmed)) {
        return false;
    }
    return (
        /^[a-z]:\\/i.test(trimmed)
        || trimmed.startsWith("\\\\")
        || trimmed.includes("\\")
        || trimmed.includes("/")
        || /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(trimmed)
    );
};

export const splitImagePaths = (rawValue: unknown) => {
    const text = String(rawValue ?? "").trim();
    if (!text) {
        return [];
    }
    return text
        .split(/[,;|]/)
        .map((part) => part.trim())
        .filter(Boolean);
};

export const buildImageFileMap = (files: File[]) => {
    const map = new Map<string, File>();
    files.forEach((file) => {
        const fileName = file.name.trim().toLowerCase();
        if (!map.has(fileName)) {
            map.set(fileName, file);
        }
        if (file.webkitRelativePath) {
            const relativeName = basenameFromPath(file.webkitRelativePath).toLowerCase();
            if (!map.has(relativeName)) {
                map.set(relativeName, file);
            }
        }
    });
    return map;
};

const guessImageMimeType = (fileName: string) => {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".png")) {
        return "image/png";
    }
    if (lower.endsWith(".webp")) {
        return "image/webp";
    }
    if (lower.endsWith(".gif")) {
        return "image/gif";
    }
    if (lower.endsWith(".bmp")) {
        return "image/bmp";
    }
    if (lower.endsWith(".svg")) {
        return "image/svg+xml";
    }
    return "image/jpeg";
};

export const extractImagesFromZip = async (zipFile: File) => {
    const zip = await JSZip.loadAsync(await zipFile.arrayBuffer());
    const extracted: File[] = [];

    await Promise.all(Object.entries(zip.files).map(async ([entryPath, entry]) => {
        if (entry.dir || !IMAGE_EXTENSION_PATTERN.test(entryPath)) {
            return;
        }
        const blob = await entry.async("blob");
        const fileName = basenameFromPath(entryPath);
        extracted.push(new File([blob], fileName, {
            type: blob.type || guessImageMimeType(fileName),
        }));
    }));

    return extracted;
};

export const mergeImageFiles = (...groups: File[][]) => {
    const merged = new Map<string, File>();
    groups.flat().forEach((file) => {
        const key = file.name.trim().toLowerCase();
        if (!merged.has(key)) {
            merged.set(key, file);
        }
    });
    return Array.from(merged.values());
};

export const fileToBase64 = (file: File) => {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(String(reader.result));
        };
        reader.onerror = () => {
            reject(new Error(`Unable to read ${file.name}`));
        };
        reader.readAsDataURL(file);
    });
};

export const resolveImageValue = async (
    rawPath: string,
    fileMap: Map<string, File>,
) => {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return {
            value: "",
            error: "Empty image path",
        };
    }
    if (isRemoteImageUrl(trimmed) || isDataUrl(trimmed)) {
        return {
            value: trimmed,
        };
    }
    const baseName = basenameFromPath(trimmed).toLowerCase();
    const file = fileMap.get(baseName);
    if (!file) {
        return {
            value: "",
            error: `No uploaded image file matches "${basenameFromPath(trimmed)}"`,
        };
    }
    const base64 = await fileToBase64(file);
    return {
        value: base64,
    };
};

const toNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const productKey = (row: Record<string, unknown>) => {
    const productId = String(row.productId ?? "").trim();
    if (productId) {
        return `id:${productId}`;
    }
    const name = String(row.name ?? "").trim().toLowerCase();
    const categoryId = String(row.categoryId ?? "").trim().toLowerCase();
    return `name:${name}|category:${categoryId}`;
};

const getRowImagePaths = (row: Record<string, unknown>) => {
    if (Array.isArray(row.imagePaths)) {
        return row.imagePaths as string[];
    }
    return splitImagePaths(row.imagePath);
};

const pickProductsSheetName = (sheetNames: string[]) => {
    const productsSheet = sheetNames.find((name) => normalizeHeader(name) === "products");
    if (productsSheet) {
        return productsSheet;
    }
    const nonInstructions = sheetNames.find((name) => normalizeHeader(name) !== "instructions");
    return nonInstructions ?? sheetNames[0];
};

export const parseExcelToProducts = (buffer: ArrayBuffer): ParsedBulkImport => {
    const workbook = XLSX.read(buffer, {
        type: "array",
    });
    const sheetName = pickProductsSheetName(workbook.SheetNames);
    if (!sheetName) {
        return {
            products: [],
            parseErrors: ["Excel file has no sheets."],
        };
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
        defval: "",
    });
    if (!rows.length) {
        return {
            products: [],
            parseErrors: ["Excel sheet is empty."],
        };
    }

    const grouped = new Map<string, BulkProductDraft>();
    const parseErrors: string[] = [];

    rows.forEach((rawRow, index) => {
        const rowNumber = index + 2;
        const row = mapRowHeaders(rawRow);
        const name = String(row.name ?? "").trim();
        const categoryId = String(row.categoryId ?? "").trim();
        const color = String(row.color ?? "").trim();
        const size = String(row.size ?? "").trim();

        if (!name && !categoryId && !color && !size) {
            return;
        }
        if (!name) {
            parseErrors.push(`Row ${rowNumber}: product name is required.`);
            return;
        }
        if (!categoryId) {
            parseErrors.push(`Row ${rowNumber}: categoryId is required.`);
            return;
        }
        if (!color || !size) {
            parseErrors.push(`Row ${rowNumber}: color and size are required.`);
            return;
        }

        const key = productKey(row);
        const existing = grouped.get(key);
        const variantId = String(row.variantId ?? "").trim() || createVariantId(color, size);
        const imagePaths = getRowImagePaths(row);
        const inventoryItem: BulkInventoryItem = {
            variantId,
            color,
            size,
            stock: Math.max(0, Math.trunc(toNumber(row.stock, 0))),
        };

        if (existing) {
            existing.rowNumbers.push(rowNumber);
            const duplicateVariant = existing.inventory.some((item) => item.variantId === variantId
                || (item.color.toLowerCase() === color.toLowerCase()
                    && item.size.toLowerCase() === size.toLowerCase()));
            if (duplicateVariant) {
                existing.inventory = existing.inventory.map((item) => {
                    if (item.variantId === variantId
                        || (item.color.toLowerCase() === color.toLowerCase()
                            && item.size.toLowerCase() === size.toLowerCase())) {
                        return inventoryItem;
                    }
                    return item;
                });
            }
            else {
                existing.inventory.push(inventoryItem);
            }
            if (imagePaths.length) {
                existing.imagePathsByColor[color] = [
                    ...(existing.imagePathsByColor[color] || []),
                    ...imagePaths,
                ];
            }
            return;
        }

        grouped.set(key, {
            key,
            productId: String(row.productId ?? "").trim() || undefined,
            name,
            description: String(row.description ?? "").trim(),
            categoryId,
            categoryName: String(row.categoryName ?? "").trim() || undefined,
            brand: String(row.brand ?? "").trim() || undefined,
            price: Math.max(0, toNumber(row.price, 0)),
            discountPercentage: Math.min(100, Math.max(0, toNumber(row.discountPercentage, 0))),
            inventory: [inventoryItem],
            imagePathsByColor: imagePaths.length
                ? {
                    [color]: imagePaths,
                }
                : {},
            images: {},
            rowNumbers: [rowNumber],
            errors: [],
        });
    });

    return {
        products: Array.from(grouped.values()),
        parseErrors,
    };
};

export const resolveProductImages = async (
    product: BulkProductDraft,
    fileMap: Map<string, File>,
) => {
    const resolvedImages: Record<string, string[]> = {};
    const errors: string[] = [];

    for (const [color, paths] of Object.entries(product.imagePathsByColor)) {
        const uniquePaths = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
        const resolvedForColor: string[] = [];
        for (const path of uniquePaths) {
            const result = await resolveImageValue(path, fileMap);
            if (result.error) {
                errors.push(`${product.name} (${color}): ${result.error} — "${path}"`);
                continue;
            }
            if (result.value) {
                resolvedForColor.push(result.value);
            }
        }
        if (resolvedForColor.length) {
            resolvedImages[color] = resolvedForColor;
        }
    }

    return {
        images: resolvedImages,
        errors,
    };
};

export const resolveAllProductImages = async (
    products: BulkProductDraft[],
    fileMap: Map<string, File>,
) => {
    const resolvedProducts: BulkProductDraft[] = [];
    const imageErrors: string[] = [];

    for (const product of products) {
        const { images, errors } = await resolveProductImages(product, fileMap);
        imageErrors.push(...errors);
        resolvedProducts.push({
            ...product,
            images,
            errors: [...product.errors, ...errors],
        });
    }

    return {
        products: resolvedProducts,
        imageErrors,
    };
};

export const countLocalImagePaths = (products: BulkProductDraft[]) => {
    let count = 0;
    products.forEach((product) => {
        Object.values(product.imagePathsByColor).forEach((paths) => {
            paths.forEach((path) => {
                if (looksLikeLocalPath(path)) {
                    count += 1;
                }
            });
        });
    });
    return count;
};

export const buildBulkImportPayload = (
    tenantId: string,
    products: BulkProductDraft[],
) => {
    return {
        tenantId,
        products: products.map((product) => ({
            productId: product.productId,
            name: product.name,
            description: product.description,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            brand: product.brand,
            price: product.price,
            discountPercentage: product.discountPercentage,
            inventory: product.inventory,
            images: product.images,
            isActive: true,
        })),
    };
};

export const downloadBulkImportTemplate = () => {
    const instructions = [
        {
            Field: "productId",
            Required: "No",
            Description: "MongoDB product ID to update. Leave empty for new products.",
        },
        {
            Field: "name",
            Required: "Yes",
            Description: "Product name. Rows with same name + categoryId are grouped.",
        },
        {
            Field: "categoryId",
            Required: "Yes",
            Description: "Category ID from your store.",
        },
        {
            Field: "color / size / stock",
            Required: "Yes",
            Description: "One Excel row per variant.",
        },
        {
            Field: "imagePath",
            Required: "No",
            Description: "Single image column. Supports URLs or local paths.",
        },
        {
            Field: "imagePath1, imagePath2, ...",
            Required: "No",
            Description: "Optional extra image columns for multiple images per variant.",
        },
        {
            Field: "Images upload",
            Required: "No",
            Description: "Upload a folder or ZIP of image files. Local paths match by filename.",
        },
    ];
    const rows = [
        {
            productId: "",
            name: "Classic Cotton Shirt",
            description: "Soft cotton shirt for daily wear",
            categoryId: "REPLACE_WITH_CATEGORY_ID",
            categoryName: "Shirts",
            brand: "UrbanCart",
            price: 999,
            discountPercentage: 10,
            color: "Black",
            size: "M",
            stock: 25,
            variantId: "",
            imagePath: "C:\\images\\shirt-black-front.jpg",
            imagePath1: "C:\\images\\shirt-black-back.jpg",
            imagePath2: "https://example.com/shirt-black-side.jpg",
        },
        {
            productId: "",
            name: "Classic Cotton Shirt",
            description: "Soft cotton shirt for daily wear",
            categoryId: "REPLACE_WITH_CATEGORY_ID",
            categoryName: "Shirts",
            brand: "UrbanCart",
            price: 999,
            discountPercentage: 10,
            color: "Black",
            size: "L",
            stock: 18,
            variantId: "",
            imagePath: "C:\\images\\shirt-black-front.jpg",
            imagePath1: "",
            imagePath2: "",
        },
        {
            productId: "",
            name: "Running Sneakers",
            description: "Lightweight sports shoes",
            categoryId: "REPLACE_WITH_CATEGORY_ID",
            categoryName: "Footwear",
            brand: "SportMax",
            price: 2499,
            discountPercentage: 15,
            color: "Blue",
            size: "9",
            stock: 30,
            variantId: "",
            imagePath: "C:\\photos\\sneakers-blue.png",
            imagePath1: "C:\\photos\\sneakers-blue-sole.png",
            imagePath2: "https://example.com/sneakers-lifestyle.jpg",
        },
    ];
    const instructionsSheet = XLSX.utils.json_to_sheet(instructions);
    const productsSheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, instructionsSheet, "Instructions");
    XLSX.utils.book_append_sheet(workbook, productsSheet, "Products");
    XLSX.writeFile(workbook, "bulk-product-import-template.xlsx");
};
