import { createCategory } from "../services/categoryService";
import { getProducts } from "../services/productService";

export const seedCategories = async (tenantId: string) => {
  try {
    const response = await getProducts(tenantId);
    const products = response.data;

    // Get unique category names
    const uniqueCategories = [...new Set(products.map((p: any) => p.categoryId))];

    for (const category of uniqueCategories) {
      try {
        await createCategory({
          tenantId,
          name: category,
          description: category,
          image: "",
        });

        console.log(`Created ${category}`);
      } catch (err) {
        console.log(`${category} already exists`);
      }
    }

    console.log("Category migration completed.");
  } catch (err) {
    console.error(err);
  }
};