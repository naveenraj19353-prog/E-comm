# Bulk Import Test Pack

Use this folder to test bulk product upload.

## Prerequisites

- Backend running
- Tenant **shopsphere** with categories (run `python app/dataset-generator/seed_fashionhub.py` if needed)
- Admin login

## Files

| File | Purpose |
|------|---------|
| test-products.xlsx | 2 test products, 4 variant rows |
| test-images.zip | All local images for path matching |
| images/ | Same images as folder upload option |

## Test steps

1. Open **Admin → Tenants → shopsphere → Products → Bulk Import**
2. Upload **test-products.xlsx**
3. Upload **test-images.zip** (or choose the **images** folder)
4. Check preview: 2 products, images resolved for Black + Blue
5. Click **Import products**

## What the Excel tests

- Local paths like `C:\bulk-import-test\images\shirt-black-front.jpg` → matched by filename, converted to base64
- **imagePath1** second local image per row
- **imagePath2** remote URL (picsum.photos) sent as-is
- Same product name + categoryId grouped into one product with multiple variants

## Products created

1. **Bulk Test Cotton Shirt** (MENS_FASHION) — Black M, L
2. **Bulk Test Running Sneakers** (FOOTWEAR) — Blue 9, 10
