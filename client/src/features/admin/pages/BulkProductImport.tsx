import { ChangeEvent, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBulkImportProducts } from "../hooks/useBulkImportProducts";
import { useTenantByTenantId } from "../hooks/useTenants";
import styles from "../styles/BulkProductImport.module.css";
import {
    buildImageFileMap,
    countLocalImagePaths,
    downloadBulkImportTemplate,
    extractImagesFromZip,
    mergeImageFiles,
    parseExcelToProducts,
    resolveAllProductImages,
    type BulkProductDraft,
} from "../utils/bulkProductImport";

export default function BulkProductImport() {
    const { tenantId = "" } = useParams();
    const navigate = useNavigate();
    const excelInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);
    const bulkImportMutation = useBulkImportProducts();
    const { data: tenant, isLoading: tenantLoading, isError: tenantError } = useTenantByTenantId(tenantId);

    const [excelFileName, setExcelFileName] = useState("");
    const [imageFileCount, setImageFileCount] = useState(0);
    const [zipFileName, setZipFileName] = useState("");
    const [uploadedImageFiles, setUploadedImageFiles] = useState<File[]>([]);
    const [products, setProducts] = useState<BulkProductDraft[]>([]);
    const [parseErrors, setParseErrors] = useState<string[]>([]);
    const [imageErrors, setImageErrors] = useState<string[]>([]);
    const [statusMessage, setStatusMessage] = useState("");
    const [isResolvingImages, setIsResolvingImages] = useState(false);

    const localPathCount = useMemo(() => countLocalImagePaths(products), [products]);
    const readyToImport = products.length > 0
        && parseErrors.length === 0
        && imageErrors.length === 0
        && (localPathCount === 0 || imageFileCount > 0);

    const applyUploadedImages = async (files: File[]) => {
        const mergedFiles = mergeImageFiles(files);
        setUploadedImageFiles(mergedFiles);
        setImageFileCount(mergedFiles.length);
        setStatusMessage("");
        setImageErrors([]);

        if (!products.length) {
            return;
        }

        setIsResolvingImages(true);
        try {
            const resolved = await resolveAllProductImages(
                products,
                buildImageFileMap(mergedFiles),
            );
            setProducts(resolved.products);
            setImageErrors(resolved.imageErrors);
        }
        finally {
            setIsResolvingImages(false);
        }
    };

    const handleExcelSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        setStatusMessage("");
        setExcelFileName(file.name);
        setParseErrors([]);
        setImageErrors([]);
        setProducts([]);

        try {
            const buffer = await file.arrayBuffer();
            const parsed = parseExcelToProducts(buffer);
            setParseErrors(parsed.parseErrors);
            if (uploadedImageFiles.length) {
                setIsResolvingImages(true);
                const resolved = await resolveAllProductImages(
                    parsed.products,
                    buildImageFileMap(uploadedImageFiles),
                );
                setProducts(resolved.products);
                setImageErrors(resolved.imageErrors);
                setIsResolvingImages(false);
            }
            else {
                setProducts(parsed.products);
            }
        }
        catch (error) {
            console.error("Failed to parse Excel file:", error);
            setParseErrors(["Unable to read the Excel file. Please use the provided template."]);
        }
        finally {
            if (excelInputRef.current) {
                excelInputRef.current.value = "";
            }
        }
    };

    const handleImageFolderSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/"));
        await applyUploadedImages(mergeImageFiles(uploadedImageFiles, files));
        if (imageInputRef.current) {
            imageInputRef.current.value = "";
        }
    };

    const handleZipSelect = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        setZipFileName(file.name);
        setStatusMessage("");
        try {
            const extracted = await extractImagesFromZip(file);
            if (!extracted.length) {
                setImageErrors(["ZIP file does not contain any supported image files (png, jpg, webp, gif, bmp, svg)."]);
                return;
            }
            await applyUploadedImages(mergeImageFiles(uploadedImageFiles, extracted));
        }
        catch (error) {
            console.error("Failed to read ZIP file:", error);
            setImageErrors(["Unable to read ZIP file. Please upload a valid .zip archive."]);
        }
        finally {
            if (zipInputRef.current) {
                zipInputRef.current.value = "";
            }
        }
    };

    const handleImport = async () => {
        if (!tenantId || !readyToImport) {
            return;
        }
        setStatusMessage("");
        try {
            const result = await bulkImportMutation.mutateAsync({
                tenantId,
                products,
            });
            if (result.failed > 0) {
                const backendErrors = result.errors.map((item) => `${item.name}: ${item.detail}`);
                setParseErrors(backendErrors);
                setStatusMessage(`Imported with errors. Created ${result.created}, updated ${result.updated}, failed ${result.failed}.`);
                return;
            }
            setStatusMessage(`Import complete. Created ${result.created}, updated ${result.updated}.`);
            navigate(`/admin/tenants/${tenantId}/products`);
        }
        catch (error) {
            console.error("Bulk import failed:", error);
            setStatusMessage("Bulk import failed. Check the Excel data and try again.");
        }
    };

    if (tenantLoading) {
        return <div className={styles.loading}>Loading tenant...</div>;
    }
    if (tenantError || !tenant) {
        return <div className={styles.error}>Tenant not found.</div>;
    }

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <div>
                    <button
                        type="button"
                        className={styles.backButton}
                        onClick={() => navigate(`/admin/tenants/${tenantId}/products`)}
                    >
                        ← Back to products
                    </button>
                    <span className={styles.eyebrow}>{tenant.tenantId}</span>
                    <h1>Bulk Product Import</h1>
                    <p>
                        Upload an Excel file for <strong>{tenant.name}</strong>. Use `imagePath`, `imagePath1`, `imagePath2`, etc. Local paths are converted to base64 when you upload matching image files or a ZIP.
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.secondaryButton} onClick={downloadBulkImportTemplate}>
                        Download template
                    </button>
                    <button
                        type="button"
                        className={styles.primaryButton}
                        disabled={!readyToImport || bulkImportMutation.isPending || isResolvingImages}
                        onClick={handleImport}
                    >
                        {bulkImportMutation.isPending ? "Importing..." : "Import products"}
                    </button>
                </div>
            </div>

            <div className={styles.card}>
                <h2>1. Excel file</h2>
                <p>One row per variant. Use `imagePath`, `imagePath1`, `imagePath2` for multiple images (URLs or local paths).</p>
                <div className={styles.uploadRow}>
                    <input
                        ref={excelInputRef}
                        className={styles.fileInput}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={handleExcelSelect}
                    />
                    <button type="button" className={styles.fileButton} onClick={() => excelInputRef.current?.click()}>
                        {excelFileName ? `Selected: ${excelFileName}` : "Choose Excel file"}
                    </button>
                </div>
            </div>

            <div className={styles.card}>
                <h2>2. Image files (for local paths)</h2>
                <p>
                    Browsers cannot read `C:\...` directly. Upload a folder, individual files, or a ZIP — we match by filename and convert to base64.
                </p>
                <div className={styles.uploadRow}>
                    <input
                        ref={imageInputRef}
                        className={styles.fileInput}
                        type="file"
                        accept="image/*"
                        multiple
                        {...({
                            webkitdirectory: "",
                            directory: "",
                        } as Record<string, string>)}
                        onChange={handleImageFolderSelect}
                    />
                    <button type="button" className={styles.fileButton} onClick={() => imageInputRef.current?.click()}>
                        {imageFileCount ? `${imageFileCount} image file(s) loaded` : "Choose image folder/files"}
                    </button>
                    <input
                        ref={zipInputRef}
                        className={styles.fileInput}
                        type="file"
                        accept=".zip,application/zip"
                        onChange={handleZipSelect}
                    />
                    <button type="button" className={styles.fileButton} onClick={() => zipInputRef.current?.click()}>
                        {zipFileName ? `ZIP: ${zipFileName}` : "Choose ZIP archive"}
                    </button>
                    {localPathCount > 0 && (
                        <span className={styles.badge}>{localPathCount} local path(s) detected</span>
                    )}
                </div>
                <div className={styles.note}>
                    <strong>How matching works:</strong> `C:\photos\shirt-black.jpg` matches `shirt-black.jpg` inside your folder or ZIP. Remote URLs in Excel are sent as-is. You can combine folder + ZIP uploads.
                </div>
            </div>

            {(parseErrors.length > 0 || imageErrors.length > 0) && (
                <div className={`${styles.card} ${styles.errorBox}`}>
                    <strong>Fix these issues before importing:</strong>
                    <ul className={styles.errorList}>
                        {[...parseErrors, ...imageErrors].map((message) => (
                            <li key={message}>{message}</li>
                        ))}
                    </ul>
                </div>
            )}

            {statusMessage && (
                <div className={`${styles.card} ${styles.successBox}`}>{statusMessage}</div>
            )}

            {products.length > 0 && (
                <div className={styles.card}>
                    <h2>Preview ({products.length} product(s))</h2>
                    <div className={styles.previewTableWrap}>
                        <table className={styles.previewTable}>
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>Variants</th>
                                    <th>Images</th>
                                    <th>Rows</th>
                                </tr>
                            </thead>
                            <tbody>
                                {products.map((product) => (
                                    <tr key={product.key}>
                                        <td>
                                            <strong>{product.name}</strong>
                                            <br />
                                            {product.categoryId}
                                            {product.productId ? (
                                                <>
                                                    <br />
                                                    ID: {product.productId}
                                                </>
                                            ) : null}
                                        </td>
                                        <td>{product.inventory.length}</td>
                                        <td>
                                            {Object.entries(product.images).length
                                                ? Object.entries(product.images).map(([color, urls]) => (
                                                    <div key={color}>
                                                        {color}: {urls.length} image(s)
                                                    </div>
                                                ))
                                                : Object.keys(product.imagePathsByColor).length
                                                    ? "Waiting for image upload"
                                                    : "None"}
                                        </td>
                                        <td>{product.rowNumbers.join(", ")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
