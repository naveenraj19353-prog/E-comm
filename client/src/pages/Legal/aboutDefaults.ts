export type AboutSectionContent = {
    heading: string;
    body: string;
};

export type AboutContent = {
    sections: [AboutSectionContent, AboutSectionContent, AboutSectionContent];
};

export const defaultAboutContent = (storeName = "Store"): AboutContent => {
    const store = storeName.trim() || "this store";
    return {
        sections: [
            {
                heading: "What you can do here",
                body: [
                    "Browse our products, add your favorites to the cart, and place your order using the payment options available at checkout.",
                    "Depending on the store's setup, delivery, pickup, cash on delivery, online payment, and returns may be available. Please check our Shipping & Returns pages for the latest details.",
                ].join("\n\n"),
            },
            {
                heading: "About this store",
                body: `${store} manages its own products, pricing, orders, fulfilment, and customer support. For questions about your order, products, delivery, or returns, please contact the store directly.`,
            },
            {
                heading: "Powered by Retail Cosmos",
                body: [
                    "This store is powered by Retail Cosmos, a commerce platform that provides the technology behind the storefront.",
                    `Retail Cosmos provides the platform, while ${store} manages its products, customers, orders, fulfilment, and customer service.`,
                ].join("\n\n"),
            },
        ],
    };
};

export const paragraphsFromBody = (body: string): string[] =>
    body
        .split(/\n\s*\n/)
        .map((part) => part.trim())
        .filter(Boolean);

export const mergeAboutContent = (
    storeName: string,
    ...sources: Array<{ sections?: Array<{ heading?: string; body?: string }> } | null | undefined>
): AboutContent => {
    const base = defaultAboutContent(storeName);
    let sections = base.sections.map((section) => ({ ...section }));
    for (const source of sources) {
        const incoming = source?.sections;
        if (!incoming?.length) {
            continue;
        }
        sections = sections.map((section, index) => {
            const custom = incoming[index];
            const heading = (custom?.heading || "").trim();
            const body = (custom?.body || "").trim();
            return {
                heading: heading || section.heading,
                body: body || section.body,
            };
        }) as AboutContent["sections"];
    }
    return { sections };
};
