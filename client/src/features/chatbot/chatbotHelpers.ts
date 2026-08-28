import axios from "axios";
import type { ProductFilter, ProductFilterCategory } from "../products/types";

const formatCategoryLabel = (name: string): string => name.replace(/_/g, " ").trim();

const formatPrice = (value: number): string => `₹${Math.round(value).toLocaleString("en-IN")}`;

export const getChatbotErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError(error)) {
        const detail = error.response?.data?.detail;
        if (typeof detail === "string" && detail.trim()) {
            return detail;
        }
        if (Array.isArray(detail)) {
            const messages = detail
                .map((item) => {
                    if (typeof item === "string") {
                        return item;
                    }
                    if (item && typeof item === "object" && "msg" in item) {
                        return String(item.msg);
                    }
                    return "";
                })
                .filter(Boolean);
            if (messages.length > 0) {
                return messages.join(". ");
            }
        }
        if (error.response?.status === 401) {
            return "Please sign in to search products.";
        }
        if (error.response?.status === 403) {
            return "You do not have permission to search products.";
        }
        if (error.response?.status && error.response.status >= 500) {
            return "Store search is temporarily unavailable. Please try again.";
        }
        if (error.message) {
            return error.message;
        }
    }
    if (error instanceof Error && error.message.trim()) {
        return error.message;
    }
    return fallback;
};

export const buildWelcomeMessage = (filter: ProductFilter | null, catalogError?: string | null): string => {
    if (catalogError) {
        return `Hi! I can help you find products by name or price.\n\nNote: Category suggestions are unavailable right now (${catalogError}). You can still search by product name and price range.`;
    }
    if (!filter) {
        return "Hi! I can help you find products. Ask by name, category, brand, color, size, rating, or price.";
    }

    const lines = ["Hi! I can help you find products in this store."];
    const categoryNames = filter.category
        .slice(0, 3)
        .map((category: ProductFilterCategory) => formatCategoryLabel(category.name));
    if (categoryNames.length > 0) {
        lines.push(`Categories: ${categoryNames.join(", ")}${filter.category.length > 3 ? ", and more" : ""}.`);
    }
    if (filter.brand.length > 0) {
        lines.push(`Brands: ${filter.brand.slice(0, 4).join(", ")}${filter.brand.length > 4 ? ", and more" : ""}.`);
    }
    if (filter.color.length > 0) {
        lines.push(`Colors: ${filter.color.slice(0, 5).join(", ")}.`);
    }
    if (filter.size.length > 0) {
        lines.push(`Sizes: ${filter.size.slice(0, 6).join(", ")}.`);
    }
    if (filter.price.max > filter.price.min) {
        lines.push(`Price range: ${formatPrice(filter.price.min)} – ${formatPrice(filter.price.max)}.`);
    }
    lines.push("Try:");
    const examples = buildExampleQueries(filter);
    examples.slice(0, 4).forEach((example) => {
        lines.push(`• "${example}"`);
    });
    return lines.join("\n");
};

export const buildExampleQueries = (filter: ProductFilter | null): string[] => {
    if (!filter) {
        return [
            "shoes under 2000",
            "products between 500 and 2000",
        ];
    }

    const examples: string[] = [];
    const firstCategory = filter.category[0];
    const secondCategory = filter.category[1];
    const { min, max } = filter.price;
    const midPrice = min + Math.round((max - min) / 2);
    const underPrice = min + Math.round((max - min) / 4);

    if (firstCategory) {
        examples.push(formatCategoryLabel(firstCategory.name));
        examples.push(`show ${formatCategoryLabel(firstCategory.name).toLowerCase()}`);
    }
    if (secondCategory && max > min) {
        examples.push(`${formatCategoryLabel(secondCategory.name).toLowerCase()} under ${Math.max(Math.round(underPrice), Math.round(min))}`);
    }
    if (max > min) {
        examples.push(`products between ${Math.round(min)} and ${Math.round(midPrice)}`);
        examples.push(`under ${Math.round(underPrice)}`);
    }
    if (filter.brand[0]) {
        examples.push(`brand ${filter.brand[0]}`);
    }
    if (filter.color[0]) {
        examples.push(`${filter.color[0].toLowerCase()} ${firstCategory ? formatCategoryLabel(firstCategory.name).toLowerCase() : "products"}`.trim());
    }
    if (filter.size[0]) {
        examples.push(`size ${filter.size[0]} under ${Math.round(underPrice)}`);
    }
    examples.push("4 star rating");
    return [...new Set(examples)].filter(Boolean);
};

export const buildQuickPrompts = (filter: ProductFilter | null): string[] => {
    if (!filter) {
        return [
            "Show all products",
            "Under ₹1000",
        ];
    }

    const prompts: string[] = [];
    filter.category.slice(0, 2).forEach((category: ProductFilterCategory) => {
        prompts.push(`Show ${formatCategoryLabel(category.name)}`);
    });

    const { min, max } = filter.price;
    if (max > min) {
        const underPrice = Math.max(min + 1, Math.round(min + (max - min) * 0.25));
        const rangeEnd = Math.max(underPrice + 1, Math.round(min + (max - min) * 0.5));
        prompts.push(`Under ${formatPrice(underPrice)}`);
        prompts.push(`Between ${formatPrice(min)} and ${formatPrice(rangeEnd)}`);
    }

    if (filter.brand[0]) {
        prompts.push(`Brand ${filter.brand[0]}`);
    }
    if (filter.color[0] && filter.size[0]) {
        prompts.push(`${filter.color[0]} size ${filter.size[0]}`);
    }
    else if (filter.color[0]) {
        prompts.push(`Color ${filter.color[0]}`);
    }

    return [...new Set(prompts)].slice(0, 5);
};

export const buildInputPlaceholder = (filter: ProductFilter | null, categories: ProductFilterCategory[]): string => {
    const categoryExample = categories[0]
        ? formatCategoryLabel(categories[0].name).toLowerCase()
        : "mens fashion";
    const priceExample = filter && filter.price.max > filter.price.min
        ? Math.round(filter.price.min + (filter.price.max - filter.price.min) * 0.25)
        : 2000;
    const colorExample = filter?.color[0]?.toLowerCase() ?? "red";
    const sizeExample = filter?.size[0] ?? "M";
    return `Try "${categoryExample} under ${priceExample}" or "${colorExample} size ${sizeExample}"`;
};

export const buildSearchSummary = (productCount: number, parsedDescription: string, totalCount?: number): string => {
    if (productCount === 0) {
        return `No products found for ${parsedDescription}. Try another name, category, brand, color, size, rating, or price range.`;
    }
    const totalSuffix = totalCount !== undefined && totalCount > productCount
        ? ` Showing top ${productCount} of ${totalCount}.`
        : "";
    return `Found ${productCount} product${productCount === 1 ? "" : "s"} for ${parsedDescription}.${totalSuffix}`;
};
