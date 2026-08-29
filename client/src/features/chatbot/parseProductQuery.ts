import type { ProductFilter, ProductFilterCategory } from "../products/types";
import {
    COMMON_PRODUCT_TERMS,
    correctSearchTokens,
    findBestFuzzyMatch,
    fuzzyScanText,
    getFuzzyThreshold,
    isBetterCatalogMatch,
    normalizeQueryKeywords,
    similarity,
} from "./fuzzyMatch";

export interface CatalogParseContext {
    categories: ProductFilterCategory[];
    brands: string[];
    colors: string[];
    sizes: string[];
}

export interface ParsedProductQuery {
    search?: string;
    categoryIds?: string[];
    minPrice?: number;
    maxPrice?: number;
    brands?: string[];
    colors?: string[];
    sizes?: string[];
    rating?: number;
    categoryLabel?: string;
    brandLabels?: string[];
    colorLabels?: string[];
    sizeLabels?: string[];
    corrections?: string[];
}

const parseAmount = (value: string): number => {
    const normalized = value.replace(/,/g, "").trim();
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : NaN;
};

const stripMatched = (text: string, match: RegExpExecArray): string => {
    return `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`.replace(/\s+/g, " ").trim();
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalize = (value: string): string => value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const MIN_PRICE_PATTERN = /(?:over|above|more than|min(?:imum)?|starting from)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/gi;
const MAX_PRICE_PATTERN = /(?:under|below|less than|upto|up to|max(?:imum)?|cheaper than)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/gi;

const collectMatches = (text: string, pattern: RegExp): Array<{
    amount: number;
    start: number;
    end: number;
}> => {
    const matches: Array<{
        amount: number;
        start: number;
        end: number;
    }> = [];
    const expression = new RegExp(pattern.source, pattern.flags);
    let match = expression.exec(text);
    while (match) {
        const amount = parseAmount(match[1]);
        if (Number.isFinite(amount)) {
            matches.push({
                amount,
                start: match.index,
                end: match.index + match[0].length,
            });
        }
        match = expression.exec(text);
    }
    return matches;
};

const removeSpans = (text: string, spans: Array<{ start: number; end: number }>): string => {
    if (spans.length === 0) {
        return text;
    }
    const sorted = [...spans].sort((a, b) => b.start - a.start);
    let result = text;
    for (const span of sorted) {
        result = `${result.slice(0, span.start)} ${result.slice(span.end)}`;
    }
    return result.replace(/\band\b/gi, " ").replace(/\s+/g, " ").trim();
};

export const extractPriceRange = (input: string): {
    text: string;
    minPrice?: number;
    maxPrice?: number;
} => {
    let text = input.trim();
    let minPrice: number | undefined;
    let maxPrice: number | undefined;

    const betweenMatch = /(?:between|from)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:and|to|-)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i.exec(text);
    if (betweenMatch) {
        minPrice = parseAmount(betweenMatch[1]);
        maxPrice = parseAmount(betweenMatch[2]);
        text = stripMatched(text, betweenMatch);
        return { text, minPrice, maxPrice };
    }

    const rangeMatch = /(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)/i.exec(text);
    if (rangeMatch) {
        minPrice = parseAmount(rangeMatch[1]);
        maxPrice = parseAmount(rangeMatch[2]);
        text = stripMatched(text, rangeMatch);
        return { text, minPrice, maxPrice };
    }

    const minMatches = collectMatches(text, MIN_PRICE_PATTERN);
    const maxMatches = collectMatches(text, MAX_PRICE_PATTERN);

    if (minMatches.length > 0) {
        minPrice = Math.max(...minMatches.map((item) => item.amount));
    }
    if (maxMatches.length > 0) {
        maxPrice = Math.min(...maxMatches.map((item) => item.amount));
    }

    if (minMatches.length > 0 || maxMatches.length > 0) {
        text = removeSpans(text, [...minMatches, ...maxMatches]);
    }

    if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
        [minPrice, maxPrice] = [maxPrice, minPrice];
    }

    return { text, minPrice, maxPrice };
};

export const extractRating = (input: string): {
    text: string;
    rating?: number;
} => {
    let text = input.trim();
    const patterns = [
        /(?:rating|rated|stars?)\s*(?:of|at|above|over|min(?:imum)?|>=)?\s*(\d(?:\.\d)?)/i,
        /(\d(?:\.\d)?)\s*\+?\s*(?:star|stars|★)/i,
        /(?:above|over|min(?:imum)?)\s*(\d(?:\.\d)?)\s*(?:star|stars|★|rating)/i,
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (!match) {
            continue;
        }
        const value = Number(match[1]);
        if (!Number.isFinite(value)) {
            continue;
        }
        const rating = Math.min(5, Math.max(1, Math.round(value)));
        text = stripMatched(text, match);
        return { text, rating };
    }

    return { text };
};

const stripCatalogValue = (text: string, value: string): string => {
    return text
        .replace(new RegExp(`\\b${escapeRegex(value)}\\b`, "i"), " ")
        .replace(/\s+/g, " ")
        .trim();
};

type FuzzyMatchResult = {
    value: string;
    similarity: number;
    matchedText: string;
};

const findCatalogValue = (phrase: string, options: string[]): FuzzyMatchResult | undefined => {
    const normalizedPhrase = normalize(phrase);
    if (!normalizedPhrase || options.length === 0) {
        return undefined;
    }

    const exact = options.find((option) => {
        const normalizedOption = normalize(option);
        return normalizedPhrase === normalizedOption
            || normalizedPhrase.includes(normalizedOption)
            || normalizedOption.includes(normalizedPhrase);
    });
    if (exact) {
        return {
            value: exact,
            similarity: 1,
            matchedText: phrase,
        };
    }

    return findBestFuzzyMatch(phrase, options, getFuzzyThreshold(phrase));
};

const stripMatchedText = (text: string, matchedText: string): string => {
    if (!matchedText.trim()) {
        return text;
    }
    return text
        .replace(new RegExp(`\\b${escapeRegex(matchedText)}\\b`, "i"), " ")
        .replace(/\s+/g, " ")
        .trim();
};

export const extractBrands = (input: string, brands: string[], colorOptions: string[] = []): {
    text: string;
    brands?: string[];
    corrections?: string[];
} => {
    let text = input.trim();
    const matched: string[] = [];
    const corrections: string[] = [];

    const brandPhrase = /(?:brand|by)\s+([a-z0-9\s&.'-]+?)(?=\s+(?:under|below|above|over|between|size|color|colour|in|category|with|rating|min|max|\d|$))/i.exec(text);
    if (brandPhrase) {
        const found = findCatalogValue(brandPhrase[1].trim(), brands);
        if (found) {
            matched.push(found.value);
            if (found.similarity < 1) {
                corrections.push(`${brandPhrase[1].trim()} → ${found.value}`);
            }
            text = stripMatched(text, brandPhrase);
        }
    }

    for (const brand of [...brands].sort((a, b) => b.length - a.length)) {
        const regex = new RegExp(`\\b${escapeRegex(brand)}\\b`, "i");
        if (regex.test(text) && !matched.includes(brand)) {
            matched.push(brand);
            text = stripCatalogValue(text, brand);
        }
    }

    if (matched.length === 0) {
        const fuzzy = fuzzyScanText(text, brands, 3);
        const acceptedMatches: Array<{ matchedText: string; value: string; similarity: number }> = [];
        fuzzy.matches.forEach((item) => {
            if (isBetterCatalogMatch(item.matchedText, item, colorOptions)) {
                return;
            }
            if (!matched.includes(item.value)) {
                matched.push(item.value);
                acceptedMatches.push(item);
                if (item.similarity < 1) {
                    corrections.push(`${item.matchedText} → ${item.value}`);
                }
            }
        });
        if (acceptedMatches.length > 0) {
            acceptedMatches.forEach((item) => {
                text = stripMatchedText(text, item.matchedText);
            });
        }
    }

    return {
        text,
        brands: matched.length > 0 ? matched : undefined,
        corrections: corrections.length > 0 ? corrections : undefined,
    };
};

export const extractColors = (input: string, colors: string[]): {
    text: string;
    colors?: string[];
    corrections?: string[];
} => {
    let text = input.trim();
    const matched: string[] = [];
    const corrections: string[] = [];

    const colorPhrase = /(?:color|colour|colored|coloured)\s+([a-z0-9\s-]+?)(?=\s+(?:under|below|above|over|between|size|brand|by|in|category|with|rating|min|max|\d|$))/i.exec(text);
    if (colorPhrase) {
        const found = findCatalogValue(colorPhrase[1].trim(), colors);
        if (found) {
            matched.push(found.value);
            if (found.similarity < 1) {
                corrections.push(`${colorPhrase[1].trim()} → ${found.value}`);
            }
            text = stripMatched(text, colorPhrase);
        }
    }

    for (const color of [...colors].sort((a, b) => b.length - a.length)) {
        const regex = new RegExp(`\\b${escapeRegex(color)}\\b`, "i");
        if (regex.test(text) && !matched.includes(color)) {
            matched.push(color);
            text = stripCatalogValue(text, color);
        }
    }

    if (matched.length === 0) {
        const fuzzy = fuzzyScanText(text, colors, 1);
        fuzzy.matches.forEach((item) => {
            if (!matched.includes(item.value)) {
                matched.push(item.value);
                if (item.similarity < 1) {
                    corrections.push(`${item.matchedText} → ${item.value}`);
                }
            }
        });
        text = fuzzy.remainingText;
    }

    return {
        text,
        colors: matched.length > 0 ? matched : undefined,
        corrections: corrections.length > 0 ? corrections : undefined,
    };
};

export const extractSizes = (input: string, sizes: string[]): {
    text: string;
    sizes?: string[];
    corrections?: string[];
} => {
    let text = input.trim();
    const matched: string[] = [];
    const corrections: string[] = [];

    const sizePhrase = /(?:size|sizes)\s+([a-z0-9]+(?:\s*[a-z0-9]+)?)(?=\s+(?:under|below|above|over|between|color|colour|brand|by|in|category|with|rating|min|max|\d|$))/i.exec(text);
    if (sizePhrase) {
        const found = findCatalogValue(sizePhrase[1].trim(), sizes);
        if (found) {
            matched.push(found.value);
            if (found.similarity < 1) {
                corrections.push(`${sizePhrase[1].trim()} → ${found.value}`);
            }
            text = stripMatched(text, sizePhrase);
        }
    }

    for (const size of [...sizes].sort((a, b) => b.length - a.length)) {
        const regex = new RegExp(`\\b${escapeRegex(size)}\\b`, "i");
        if (regex.test(text) && !matched.includes(size)) {
            matched.push(size);
            text = stripCatalogValue(text, size);
        }
    }

    if (matched.length === 0) {
        const fuzzy = fuzzyScanText(text, sizes, 1);
        fuzzy.matches.forEach((item) => {
            if (!matched.includes(item.value)) {
                matched.push(item.value);
                if (item.similarity < 1) {
                    corrections.push(`${item.matchedText} → ${item.value}`);
                }
            }
        });
        text = fuzzy.remainingText;
    }

    return {
        text,
        sizes: matched.length > 0 ? matched : undefined,
        corrections: corrections.length > 0 ? corrections : undefined,
    };
};

const categoryScore = (query: string, categoryName: string): number => {
    const q = normalize(query);
    const name = normalize(categoryName);
    if (!q || !name) {
        return 0;
    }
    const fuzzyScore = similarity(q, name);
    if (fuzzyScore >= getFuzzyThreshold(q)) {
        return fuzzyScore * 100;
    }
    if (q.includes(name) || name.includes(q)) {
        return name.length;
    }
    const qWords = q.split(" ");
    const nameWords = name.split(" ");
    let score = 0;
    for (const word of qWords) {
        if (word.length < 3) {
            continue;
        }
        for (const nameWord of nameWords) {
            const wordScore = similarity(word, nameWord);
            if (wordScore >= getFuzzyThreshold(word)) {
                score += wordScore * word.length;
            }
            else if (nameWord.includes(word) || word.includes(nameWord)) {
                score += word.length;
            }
        }
    }
    return score;
};

export const extractCategory = (input: string, categories: ProductFilterCategory[]): {
    text: string;
    categoryIds?: string[];
    categoryLabel?: string;
    corrections?: string[];
} => {
    let text = input.trim();
    const corrections: string[] = [];
    const categoryPhraseMatch = /(?:in|from|category|categories)\s+([a-z0-9\s_-]+?)(?:\s+(?:under|below|above|over|between|with|for|price|size|color|colour|brand|rating)|$)/i.exec(text);
    if (categoryPhraseMatch) {
        const phrase = categoryPhraseMatch[1].trim();
        text = stripMatched(text, categoryPhraseMatch);
        const best = categories
            .map((category) => ({
                category,
                score: categoryScore(phrase, category.name),
            }))
            .sort((a, b) => b.score - a.score)[0];
        if (best && best.score > 0) {
            if (normalize(phrase) !== normalize(best.category.name)) {
                corrections.push(`${phrase} → ${best.category.name.replace(/_/g, " ")}`);
            }
            return {
                text,
                categoryIds: [best.category.id],
                categoryLabel: best.category.name,
                corrections: corrections.length > 0 ? corrections : undefined,
            };
        }
    }

    const ranked = categories
        .map((category) => ({
            category,
            score: categoryScore(text, category.name),
        }))
        .filter((item) => item.score >= getFuzzyThreshold(text) * 10 || item.score >= 4)
        .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
        const fuzzy = fuzzyScanText(
            text,
            categories.map((category) => category.name.replace(/_/g, " ")),
            3,
        );
        if (fuzzy.matches.length > 0) {
            const bestMatch = fuzzy.matches[0];
            const category = categories.find((item) => similarity(item.name.replace(/_/g, " "), bestMatch.value) >= getFuzzyThreshold(bestMatch.matchedText));
            if (category) {
                if (bestMatch.similarity < 1) {
                    corrections.push(`${bestMatch.matchedText} → ${category.name.replace(/_/g, " ")}`);
                }
                return {
                    text: fuzzy.remainingText,
                    categoryIds: [category.id],
                    categoryLabel: category.name,
                    corrections: corrections.length > 0 ? corrections : undefined,
                };
            }
        }
        return { text };
    }

    const best = ranked[0];
    const displayName = best.category.name.replace(/_/g, " ");
    const textNormalized = normalize(text);
    const bestName = normalize(displayName);
    if (textNormalized.includes(bestName) || similarity(text, displayName) >= getFuzzyThreshold(text)) {
        const matchedPhrase = findBestFuzzyMatch(text, [displayName], getFuzzyThreshold(text));
        if (matchedPhrase && matchedPhrase.similarity < 1) {
            corrections.push(`${matchedPhrase.matchedText} → ${displayName}`);
            text = stripMatchedText(text, matchedPhrase.matchedText);
        }
        else {
            text = text.replace(new RegExp(best.category.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
                .replace(new RegExp(displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), " ")
                .replace(/\s+/g, " ")
                .trim();
        }
    }
    return {
        text,
        categoryIds: [best.category.id],
        categoryLabel: best.category.name,
        corrections: corrections.length > 0 ? corrections : undefined,
    };
};

export const toCatalogParseContext = (filter: ProductFilter | null): CatalogParseContext => ({
    categories: filter?.category ?? [],
    brands: filter?.brand ?? [],
    colors: filter?.color ?? [],
    sizes: filter?.size ?? [],
});

const buildSearchVocabulary = (context: CatalogParseContext): string[] => {
    const categoryLabels = context.categories.map((category) => category.name.replace(/_/g, " "));
    const categoryTokens = categoryLabels.flatMap((label) => label.split(/\s+/).filter((word) => word.length > 2));
    return [
        ...new Set([
            ...context.brands,
            ...context.colors,
            ...context.sizes,
            ...categoryLabels,
            ...categoryTokens,
            ...COMMON_PRODUCT_TERMS,
        ]),
    ];
};

export const parseProductQuery = (input: string, context: CatalogParseContext = {
    categories: [],
    brands: [],
    colors: [],
    sizes: [],
}): ParsedProductQuery => {
    const keywordNormalized = normalizeQueryKeywords(input);
    const cleaned = keywordNormalized.text
        .replace(/^(show|find|search|get|look for|i want|i need|products?|items?)\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();

    const corrections: string[] = [...keywordNormalized.corrections];
    const { text: afterPrice, minPrice, maxPrice } = extractPriceRange(cleaned);
    const { text: afterRating, rating } = extractRating(afterPrice);
    const colorResult = extractColors(afterRating, context.colors);
    const brandResult = extractBrands(colorResult.text, context.brands, context.colors);
    const sizeResult = extractSizes(brandResult.text, context.sizes);
    const categoryResult = extractCategory(sizeResult.text, context.categories);

    [
        colorResult.corrections,
        brandResult.corrections,
        sizeResult.corrections,
        categoryResult.corrections,
    ].forEach((items) => {
        if (items) {
            corrections.push(...items);
        }
    });

    const rawSearch = categoryResult.text
        .replace(/^(with|for|named|called)\s+/i, "")
        .replace(/\s+/g, " ")
        .trim();

    const vocabulary = buildSearchVocabulary(context);
    const correctedSearch = rawSearch
        ? correctSearchTokens(rawSearch, vocabulary)
        : { corrected: "", corrections: [] as string[] };
    corrections.push(...correctedSearch.corrections);

    return {
        search: correctedSearch.corrected || undefined,
        categoryIds: categoryResult.categoryIds,
        categoryLabel: categoryResult.categoryLabel,
        minPrice: Number.isFinite(minPrice) ? minPrice : undefined,
        maxPrice: Number.isFinite(maxPrice) ? maxPrice : undefined,
        brands: brandResult.brands,
        brandLabels: brandResult.brands,
        colors: colorResult.colors,
        colorLabels: colorResult.colors,
        sizes: sizeResult.sizes,
        sizeLabels: sizeResult.sizes,
        rating,
        corrections: corrections.length > 0 ? [...new Set(corrections)] : undefined,
    };
};

export const describeParsedQuery = (parsed: ParsedProductQuery): string => {
    const parts: string[] = [];
    if (parsed.search) {
        parts.push(`name "${parsed.search}"`);
    }
    if (parsed.categoryLabel || parsed.categoryIds?.length) {
        parts.push(`category ${parsed.categoryLabel || parsed.categoryIds?.[0]}`);
    }
    if (parsed.brandLabels?.length) {
        parts.push(`brand ${parsed.brandLabels.join(", ")}`);
    }
    if (parsed.colorLabels?.length) {
        parts.push(`color ${parsed.colorLabels.join(", ")}`);
    }
    if (parsed.sizeLabels?.length) {
        parts.push(`size ${parsed.sizeLabels.join(", ")}`);
    }
    if (parsed.rating !== undefined) {
        parts.push(`${parsed.rating}★ & up`);
    }
    if (parsed.minPrice !== undefined && parsed.maxPrice !== undefined) {
        parts.push(`price ₹${parsed.minPrice.toLocaleString("en-IN")} – ₹${parsed.maxPrice.toLocaleString("en-IN")}`);
    }
    else if (parsed.maxPrice !== undefined) {
        parts.push(`price under ₹${parsed.maxPrice.toLocaleString("en-IN")}`);
    }
    else if (parsed.minPrice !== undefined) {
        parts.push(`price above ₹${parsed.minPrice.toLocaleString("en-IN")}`);
    }
    if (parts.length === 0) {
        return "your request";
    }
    const summary = parts.join(", ");
    if (parsed.corrections?.length) {
        return `${summary} (matched: ${parsed.corrections.join("; ")})`;
    }
    return summary;
};
