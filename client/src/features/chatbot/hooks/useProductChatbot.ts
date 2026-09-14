import axios from "axios";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAppSelector } from "../../../app/hooks";
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
    const [hasOpened, setHasOpened] = useState(false);
    const [input, setInput] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const storedCatalogFilter = useAppSelector(
        (state) => state.products.catalogFilter,
    );
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([
        createWelcomeMessage(buildWelcomeMessage(null)),
    ]);

    const openChat = useCallback(() => {
        setHasOpened(true);
        setIsOpen(true);
    }, []);

    // Reuse catalog from products page when available; otherwise fetch once on first open.
    const catalogQuery = useQuery({
        queryKey: ["chatbot-catalog", tenantId],
        queryFn: async () => {
            const response = await getProducts({
                tenantId,
                page: 1,
                limit: 1,
            });
            return response.filter ?? null;
        },
        enabled: Boolean(tenantId) && hasOpened && !storedCatalogFilter,
        staleTime: 5 * 60 * 1000,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        retry: 1,
    });

    const catalogFilter: ProductFilter | null =
        storedCatalogFilter ?? catalogQuery.data ?? null;
    const categories: ProductFilterCategory[] = catalogFilter?.category ?? [];
    const isCatalogLoading =
        hasOpened && !storedCatalogFilter && catalogQuery.isFetching;

    useEffect(() => {
        if (catalogQuery.isError) {
            const message = getChatbotErrorMessage(
                catalogQuery.error,
                "Unable to load category filters.",
            );
            setCatalogError(message);
            setMessages([createWelcomeMessage(buildWelcomeMessage(null, message))]);
            return;
        }
        setCatalogError(null);
        if (catalogFilter || hasOpened) {
            setMessages((current) => {
                if (current.length !== 1 || current[0]?.role !== "bot") {
                    return current;
                }
                return [createWelcomeMessage(buildWelcomeMessage(catalogFilter))];
            });
        }
    }, [catalogFilter, catalogQuery.error, catalogQuery.isError, hasOpened]);

    const quickPrompts = useMemo(() => buildQuickPrompts(catalogFilter), [catalogFilter]);
    const inputPlaceholder = useMemo(
        () => buildInputPlaceholder(catalogFilter, categories),
        [catalogFilter, categories],
    );

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
        setIsOpen: (open: boolean | ((prev: boolean) => boolean)) => {
            const next = typeof open === "function" ? open(isOpen) : open;
            if (next) {
                openChat();
                return;
            }
            setIsOpen(false);
        },
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
