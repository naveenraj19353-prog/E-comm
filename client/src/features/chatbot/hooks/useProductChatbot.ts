import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getProducts } from "../../products/api/product.api";
import type { ProductFilter, ProductFilterCategory } from "../../products/types";
import {
    buildInputPlaceholder,
    buildQuickPrompts,
    buildSearchSummary,
    buildWelcomeMessage,
    getChatbotErrorMessage,
} from "../chatbotHelpers";
import {
    describeParsedQuery,
    parseProductQuery,
    toCatalogParseContext,
} from "../parseProductQuery";
import {
    type ChatMessage,
    toChatProduct,
} from "../types";

const SEARCH_RESULT_LIMIT = 8;
const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createWelcomeMessage = (text: string): ChatMessage => ({
    id: createId(),
    role: "bot",
    text,
});

export const useProductChatbot = (tenantId: string) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [isCatalogLoading, setIsCatalogLoading] = useState(false);
    const [catalogFilter, setCatalogFilter] = useState<ProductFilter | null>(null);
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [categories, setCategories] = useState<ProductFilterCategory[]>([]);
    const [messages, setMessages] = useState<ChatMessage[]>([
        createWelcomeMessage("Hi! Loading store catalog..."),
    ]);

    useEffect(() => {
        if (!tenantId) {
            setCatalogFilter(null);
            setCategories([]);
            setCatalogError(null);
            setMessages([createWelcomeMessage(buildWelcomeMessage(null))]);
            return;
        }

        let mounted = true;
        const loadCatalog = async () => {
            setIsCatalogLoading(true);
            setCatalogError(null);
            try {
                const response = await getProducts({
                    tenantId,
                    page: 1,
                    limit: 1,
                });
                if (!mounted) {
                    return;
                }
                const filter = response.filter ?? null;
                setCatalogFilter(filter);
                setCategories(filter?.category ?? []);
                const welcomeText = buildWelcomeMessage(filter);
                setMessages((current) => current.map((message, index) => index === 0 && message.role === "bot" && !message.products
                    ? { ...message, text: welcomeText }
                    : message));
            }
            catch (error) {
                if (!mounted) {
                    return;
                }
                const message = getChatbotErrorMessage(
                    error,
                    "Unable to load category filters.",
                );
                setCatalogError(message);
                setCatalogFilter(null);
                setCategories([]);
                const welcomeText = buildWelcomeMessage(null, message);
                setMessages((current) => current.map((message, index) => index === 0 && message.role === "bot" && !message.products
                    ? { ...message, text: welcomeText }
                    : message));
            }
            finally {
                if (mounted) {
                    setIsCatalogLoading(false);
                }
            }
        };

        void loadCatalog();
        return () => {
            mounted = false;
        };
    }, [tenantId]);

    const quickPrompts = useMemo(() => buildQuickPrompts(catalogFilter), [catalogFilter]);
    const inputPlaceholder = useMemo(() => buildInputPlaceholder(catalogFilter, categories), [catalogFilter, categories]);

    const sendMessage = useCallback(async (rawText: string) => {
        const text = rawText.trim();
        if (!text || !tenantId || isSearching) {
            return;
        }

        const userMessage: ChatMessage = {
            id: createId(),
            role: "user",
            text,
        };
        const loadingId = createId();
        const loadingMessage: ChatMessage = {
            id: loadingId,
            role: "bot",
            text: "Searching products...",
            isLoading: true,
        };

        setMessages((current) => [...current, userMessage, loadingMessage]);
        setInput("");
        setIsSearching(true);

        try {
            const parsed = parseProductQuery(text, toCatalogParseContext(catalogFilter));
            const response = await getProducts({
                tenantId,
                page: 1,
                limit: SEARCH_RESULT_LIMIT,
                search: parsed.search,
                categoryIds: parsed.categoryIds,
                brands: parsed.brands,
                colors: parsed.colors,
                sizes: parsed.sizes,
                rating: parsed.rating,
                minPrice: parsed.minPrice,
                maxPrice: parsed.maxPrice,
                sortBy: parsed.rating ? "rating" : "createdAt",
                sortOrder: "desc",
            });

            if (!response.success) {
                throw new Error("Product search did not succeed.");
            }

            const products = (response.data ?? []).map(toChatProduct);
            const parsedDescription = describeParsedQuery(parsed);
            const summary = buildSearchSummary(
                products.length,
                parsedDescription,
                response.totalCount,
            );

            setMessages((current) => current.map((message) => message.id === loadingId
                ? {
                    id: loadingId,
                    role: "bot",
                    text: summary,
                    products,
                }
                : message));
        }
        catch (error) {
            const errorMessage = getChatbotErrorMessage(
                error,
                "Something went wrong while searching. Please try again.",
            );
            if (!axios.isAxiosError(error)) {
                console.error("Product chatbot search failed:", error);
            }
            setMessages((current) => current.map((message) => message.id === loadingId
                ? {
                    id: loadingId,
                    role: "bot",
                    text: errorMessage,
                }
                : message));
        }
        finally {
            setIsSearching(false);
        }
    }, [catalogFilter, isSearching, tenantId]);

    return {
        isOpen,
        setIsOpen,
        input,
        setInput,
        messages,
        isSearching,
        isCatalogLoading,
        catalogError,
        sendMessage,
        quickPrompts,
        inputPlaceholder,
    };
};
