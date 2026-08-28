import type { Product } from "../products/types";

export type ChatRole = "user" | "bot";

export interface ChatProductResult {
    _id: string;
    name: string;
    finalPrice: number;
    image?: string;
    categoryName?: string;
}

export interface ChatMessage {
    id: string;
    role: ChatRole;
    text: string;
    products?: ChatProductResult[];
    isLoading?: boolean;
}

export const toChatProduct = (product: Product): ChatProductResult => {
    const image = Object.values(product.images ?? {})
        .flat()
        .find((item) => typeof item === "string" && item.trim().length > 0);
    return {
        _id: product._id,
        name: product.name,
        finalPrice: product.finalPrice,
        image,
        categoryName: product.categoryName,
    };
};
