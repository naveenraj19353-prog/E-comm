import Fuse from "fuse.js";

const MAX_FUSE_CACHE = 32;
const fuseCache = new Map<string, Fuse<string>>();

const levenshtein = (left: string, right: string): number => {
    if (left === right) {
        return 0;
    }
    if (!left.length) {
        return right.length;
    }
    if (!right.length) {
        return left.length;
    }

    const rows = left.length + 1;
    const cols = right.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

    for (let row = 0; row < rows; row += 1) {
        matrix[row][0] = row;
    }
    for (let col = 0; col < cols; col += 1) {
        matrix[0][col] = col;
    }

    for (let row = 1; row < rows; row += 1) {
        for (let col = 1; col < cols; col += 1) {
            const cost = left[row - 1] === right[col - 1] ? 0 : 1;
            matrix[row][col] = Math.min(
                matrix[row - 1][col] + 1,
                matrix[row][col - 1] + 1,
                matrix[row - 1][col - 1] + cost,
            );
        }
    }

    return matrix[rows - 1][cols - 1];
};

export const similarity = (left: string, right: string): number => {
    const a = left.trim().toLowerCase();
    const b = right.trim().toLowerCase();
    if (!a || !b) {
        return 0;
    }
    if (a === b) {
        return 1;
    }
    if (a.includes(b) || b.includes(a)) {
        const shorter = Math.min(a.length, b.length);
        const longer = Math.max(a.length, b.length);
        return shorter / longer;
    }
    const distance = levenshtein(a, b);
    const longest = Math.max(a.length, b.length);
    return longest === 0 ? 0 : 1 - distance / longest;
};

export interface FuzzyMatchResult {
    value: string;
    similarity: number;
    matchedText: string;
}

const getFuseIndex = (options: string[]): Fuse<string> => {
    const key = options.join("\u0000");
    const cached = fuseCache.get(key);
    if (cached) {
        return cached;
    }

    if (fuseCache.size >= MAX_FUSE_CACHE) {
        const firstKey = fuseCache.keys().next().value;
        if (firstKey) {
            fuseCache.delete(firstKey);
        }
    }

    const fuse = new Fuse(options, {
        includeScore: true,
        ignoreLocation: true,
        threshold: 0.4,
        minMatchCharLength: 2,
        distance: 100,
        isCaseSensitive: false,
    });
    fuseCache.set(key, fuse);
    return fuse;
};

const findBestLevenshteinMatch = (
    phrase: string,
    options: string[],
    minSimilarity: number,
): FuzzyMatchResult | undefined => {
    let best: FuzzyMatchResult | undefined;
    for (const option of options) {
        const score = similarity(phrase, option);
        if (score < minSimilarity) {
            continue;
        }
        if (!best || score > best.similarity) {
            best = {
                value: option,
                similarity: score,
                matchedText: phrase,
            };
        }
    }
    return best;
};

export const findBestFuzzyMatch = (
    phrase: string,
    options: string[],
    minSimilarity = 0.72,
): FuzzyMatchResult | undefined => {
    const normalizedPhrase = phrase.trim().toLowerCase();
    if (!normalizedPhrase || options.length === 0) {
        return undefined;
    }

    const exact = options.find((option) => {
        const normalizedOption = option.toLowerCase();
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

    const fuse = getFuseIndex(options);
    const results = fuse.search(normalizedPhrase, { limit: 8 });

    let best: FuzzyMatchResult | undefined;
    for (const result of results) {
        const fuseScore = result.score ?? 1;
        const similarityScore = 1 - fuseScore;
        if (similarityScore < minSimilarity) {
            continue;
        }
        if (!best || similarityScore > best.similarity) {
            best = {
                value: result.item,
                similarity: similarityScore,
                matchedText: phrase,
            };
        }
    }

    if (best) {
        return best;
    }

    return findBestLevenshteinMatch(normalizedPhrase, options, minSimilarity);
};

export const getFuzzyThreshold = (value: string): number => {
    const length = value.trim().length;
    if (length <= 2) {
        return 1;
    }
    if (length <= 4) {
        return 0.8;
    }
    if (length <= 6) {
        return 0.74;
    }
    return 0.68;
};

export const tokenize = (text: string): string[] => text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);

export const buildPhraseWindows = (tokens: string[], maxWindow = 3): string[] => {
    const phrases: string[] = [];
    for (let window = 1; window <= Math.min(maxWindow, tokens.length); window += 1) {
        for (let index = 0; index <= tokens.length - window; index += 1) {
            phrases.push(tokens.slice(index, index + window).join(" "));
        }
    }
    return phrases;
};

export const QUERY_KEYWORDS = [
    "brand", "by", "color", "colour", "colored", "coloured",
    "size", "sizes", "rating", "rated", "star", "stars",
    "under", "below", "less", "than", "above", "over", "more",
    "between", "from", "and", "to", "category", "categories",
    "with", "for", "min", "max", "upto", "cheaper", "starting",
    "minimum", "maximum", "show", "find", "search", "price",
];

export const COMMON_PRODUCT_TERMS = [
    "shirt", "shirts", "shoe", "shoes", "pant", "pants", "jeans",
    "dress", "dresses", "bag", "bags", "watch", "watches", "belt",
    "jacket", "hoodie", "sneaker", "sneakers", "tshirt", "kurta",
    "saree", "top", "tops", "skirt", "shorts", "wallet", "sandal",
    "sandals", "boot", "boots", "coat", "sweater", "blazer", "tie",
];

export const isBetterCatalogMatch = (
    token: string,
    proposed: FuzzyMatchResult,
    alternatives: string[],
): boolean => {
    if (alternatives.length === 0) {
        return false;
    }
    const alternative = findBestFuzzyMatch(token, alternatives, getFuzzyThreshold(token));
    if (!alternative) {
        return false;
    }
    const proposedScore = similarity(token, proposed.value);
    const alternativeScore = similarity(token, alternative.value);
    return alternativeScore > proposedScore + 0.02;
};

export const normalizeQueryKeywords = (
    input: string,
): {
    text: string;
    corrections: string[];
} => {
    const tokens = tokenize(input);
    if (tokens.length === 0) {
        return { text: input.trim(), corrections: [] };
    }

    const corrections: string[] = [];
    const normalizedTokens = tokens.map((token) => {
        if (/^\d+$/.test(token) || token.length <= 2) {
            return token;
        }
        const match = findBestFuzzyMatch(token, QUERY_KEYWORDS, getFuzzyThreshold(token));
        if (match && match.value.toLowerCase() !== token.toLowerCase()) {
            corrections.push(`${token} → ${match.value}`);
            return match.value;
        }
        return token;
    });

    return {
        text: normalizedTokens.join(" "),
        corrections,
    };
};

export const fuzzyScanText = (
    text: string,
    options: string[],
    maxWindow = 3,
): {
    matches: FuzzyMatchResult[];
    remainingText: string;
} => {
    const tokens = tokenize(text);
    if (tokens.length === 0 || options.length === 0) {
        return { matches: [], remainingText: text.trim() };
    }

    const usedTokenIndexes = new Set<number>();
    const matches: FuzzyMatchResult[] = [];
    const windowLimit = Math.min(maxWindow, tokens.length);

    for (let windowSize = windowLimit; windowSize >= 1; windowSize -= 1) {
        for (let index = 0; index <= tokens.length - windowSize; index += 1) {
            const overlaps = Array.from({ length: windowSize }, (_, offset) => index + offset)
                .some((tokenIndex) => usedTokenIndexes.has(tokenIndex));
            if (overlaps) {
                continue;
            }

            const candidate = tokens.slice(index, index + windowSize).join(" ");
            const threshold = Math.min(getFuzzyThreshold(candidate), getFuzzyThreshold(options[0] ?? candidate));
            const match = findBestFuzzyMatch(candidate, options, threshold);
            if (!match || match.similarity < threshold) {
                continue;
            }

            matches.push({
                value: match.value,
                similarity: match.similarity,
                matchedText: candidate,
            });
            for (let offset = 0; offset < windowSize; offset += 1) {
                usedTokenIndexes.add(index + offset);
            }
        }
    }

    const remainingTokens = tokens.filter((_, index) => !usedTokenIndexes.has(index));
    return {
        matches,
        remainingText: remainingTokens.join(" ").trim(),
    };
};

export const correctSearchTokens = (
    search: string,
    vocabulary: string[],
): {
    corrected: string;
    corrections: string[];
} => {
    const tokens = tokenize(search);
    if (tokens.length === 0) {
        return { corrected: "", corrections: [] };
    }

    const uniqueVocabulary = [...new Set(vocabulary.filter(Boolean))];
    const correctedTokens: string[] = [];
    const corrections: string[] = [];

    for (const token of tokens) {
        if (/^\d+$/.test(token) || token.length <= 2) {
            correctedTokens.push(token);
            continue;
        }
        const match = findBestFuzzyMatch(token, uniqueVocabulary, getFuzzyThreshold(token));
        if (match && match.value.toLowerCase() !== token.toLowerCase()) {
            correctedTokens.push(match.value);
            corrections.push(`${token} → ${match.value}`);
            continue;
        }
        correctedTokens.push(token);
    }

    return {
        corrected: correctedTokens.join(" "),
        corrections,
    };
};
