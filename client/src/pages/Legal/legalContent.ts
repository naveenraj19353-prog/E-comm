export type LegalSection = {
    heading: string;
    paragraphs: string[];
};

export type LegalDocument = {
    eyebrow: string;
    title: string;
    updated: string;
    intro: string;
    sections: LegalSection[];
};

export const STOREFRONT_LEGAL_SLUGS = [
    "about",
    "contact",
    "privacy",
    "terms",
    "returns",
    "shipping",
] as const;

export type StorefrontLegalSlug = (typeof STOREFRONT_LEGAL_SLUGS)[number];

export const PLATFORM_LEGAL_SLUGS = [
    "about",
    "privacy",
    "terms",
] as const;

export type PlatformLegalSlug = (typeof PLATFORM_LEGAL_SLUGS)[number];

type StorefrontLegalInput = {
    storeName: string;
    email?: string;
};

export function isStorefrontLegalSlug(value: string): value is StorefrontLegalSlug {
    return (STOREFRONT_LEGAL_SLUGS as readonly string[]).includes(value);
}

export function isPlatformLegalSlug(value: string): value is PlatformLegalSlug {
    return (PLATFORM_LEGAL_SLUGS as readonly string[]).includes(value);
}

export function storefrontLegalDocument(
    slug: StorefrontLegalSlug,
    input: StorefrontLegalInput,
): LegalDocument {
    const store = input.storeName.trim() || "this store";
    const email = input.email?.trim();

    switch (slug) {
        case "about":
            return {
                eyebrow: "ABOUT US",
                title: `About ${store}`,
                updated: "September 2026",
                intro: `${store} is an independent online store powered by Retail Cosmos. We offer carefully selected products and a simple, secure shopping experience for our customers.`,
                sections: [
                    {
                        heading: "What you can do here",
                        paragraphs: [
                            "Browse our products, add your favorites to the cart, and place your order using the payment options available at checkout.",
                            "Depending on the store's setup, delivery, pickup, cash on delivery, online payment, and returns may be available. Please check our Shipping & Returns pages for the latest details.",
                        ],
                    },
                    {
                        heading: "About this store",
                        paragraphs: [
                            `${store} manages its own products, pricing, orders, fulfilment, and customer support. For questions about your order, products, delivery, or returns, please contact the store directly.`,
                        ],
                    },
                    {
                        heading: "Powered by Retail Cosmos",
                        paragraphs: [
                            "This store is powered by Retail Cosmos, a commerce platform that provides the technology behind the storefront.",
                            `Retail Cosmos provides the platform, while ${store} manages its products, customers, orders, fulfilment, and customer service.`,
                        ],
                    },
                ],
            };
        case "contact":
            return {
                eyebrow: "Company",
                title: `Contact ${store}`,
                updated: "September 2026",
                intro: `Send a message to ${store}. The store team can read it in their admin inbox and can reply by email.`,
                sections: [
                    {
                        heading: "How to reach us",
                        paragraphs: [
                            email
                                ? `Write to ${email} or use the form below.`
                                : "Use the form below. Include your email so the store can write back.",
                            "If you have an order, include the order ID in your message so the store can find it quickly.",
                        ],
                    },
                ],
            };
        case "privacy":
            return {
                eyebrow: "Legal",
                title: "Privacy Policy",
                updated: "September 2026",
                intro: `This policy explains how ${store} uses information when you browse, create an account, or place an order.`,
                sections: [
                    {
                        heading: "Information we collect",
                        paragraphs: [
                            "Account details you provide (name, email, phone, password).",
                            "Messages you send through the Contact form (name, email, and message text).",
                            "Delivery addresses and order history for this store.",
                            "Technical data such as browser type needed to run the storefront.",
                        ],
                    },
                    {
                        heading: "How we use it",
                        paragraphs: [
                            "To fulfil orders, show order status, process returns, and contact you about your purchase.",
                            "To sign you in and keep your cart, wishlist, and addresses on this store.",
                        ],
                    },
                    {
                        heading: "Processors",
                        paragraphs: [
                            "Online payments are processed by Razorpay. This store does not store your full card details.",
                            "If this store ships with a courier partner such as Delhivery, name, phone, and address are shared so the parcel can be picked up and delivered.",
                            "Order and login messages may be sent over WhatsApp when the store has that channel connected.",
                        ],
                    },
                    {
                        heading: "Your choices",
                        paragraphs: [
                            "You can update profile details from your account. For deletion or other privacy requests, contact the store using the Contact page.",
                            "Retail Cosmos hosts this storefront. Information for this shop stays with this store.",
                        ],
                    },
                ],
            };
        case "terms":
            return {
                eyebrow: "Legal",
                title: "Terms of Use",
                updated: "September 2026",
                intro: `These terms apply when you use ${store} to browse or buy.`,
                sections: [
                    {
                        heading: "Orders and payment",
                        paragraphs: [
                            "An order is confirmed after checkout succeeds (online payment verification or cash-on-delivery placement).",
                            "Prices, shipping charges, and available payment methods are shown at checkout. They can change until you place the order.",
                        ],
                    },
                    {
                        heading: "Fulfilment and cancellation",
                        paragraphs: [
                            "The store prepares and ships or otherwise fulfils your order. Courier tracking appears when a waybill is created.",
                            "If the store cancels an order before it is completed, stock is restored. Prepaid refunds for cancellations are handled by the store; use My Orders and Contact if you need a refund after a cancel.",
                        ],
                    },
                    {
                        heading: "Returns",
                        paragraphs: [
                            "Eligible delivered orders can be returned within 2 days of delivery using the return request on the order page. The Returns policy on this site has the full process.",
                        ],
                    },
                    {
                        heading: "Acceptable use",
                        paragraphs: [
                            "Do not misuse the storefront, attempt unauthorized access, or place fraudulent orders.",
                        ],
                    },
                ],
            };
        case "returns":
            return {
                eyebrow: "Support",
                title: "Returns",
                updated: "September 2026",
                intro: `${store} accepts return requests for 2 days after delivery on eligible orders.`,
                sections: [
                    {
                        heading: "How to request a return",
                        paragraphs: [
                            "Open My Orders, choose the delivered order, and submit a return request with a short reason.",
                            "Menu / dine-in style orders are not eligible for courier returns.",
                        ],
                    },
                    {
                        heading: "What happens next",
                        paragraphs: [
                            "The store reviews the request. If approved, reverse pickup is arranged when a courier is connected; otherwise the store will share pickup instructions.",
                            "After the return is received, stock is restored and a refund is issued to the original online payment, or marked as a manual refund for cash on delivery.",
                        ],
                    },
                    {
                        heading: "Window",
                        paragraphs: [
                            "The 2-day window starts from the delivery date on the order. Requests after that window cannot be submitted in the app.",
                        ],
                    },
                ],
            };
        case "shipping":
            return {
                eyebrow: "Support",
                title: "Shipping",
                updated: "September 2026",
                intro: "Shipping options and charges for this store are calculated at checkout. They are not a single platform-wide rate or delivery window.",
                sections: [
                    {
                        heading: "How delivery works",
                        paragraphs: [
                            "If this store offers delivery, choose the address at checkout. The amount shown there is the shipping charge for that order.",
                            "When the store creates a courier shipment (for example with Delhivery), you get a waybill and tracking on the order page.",
                        ],
                    },
                    {
                        heading: "Pickup and timing",
                        paragraphs: [
                            "Pickup is requested by the store after a shipment is created. Transit time depends on the courier, pincode, and how quickly the store hands over the parcel.",
                            "This page does not promise a fixed number of delivery days. Use order tracking for the live status.",
                        ],
                    },
                    {
                        heading: "Issues with a parcel",
                        paragraphs: [
                            "If a package is delayed or damaged, contact the store from the Contact page and include your order ID.",
                        ],
                    },
                ],
            };
        default:
            return storefrontLegalDocument("about", input);
    }
}

export function platformLegalDocument(slug: PlatformLegalSlug): LegalDocument {
    switch (slug) {
        case "about":
            return {
                eyebrow: "Retail Cosmos",
                title: "About Retail Cosmos",
                updated: "September 2026",
                intro: "Retail Cosmos is a multi-tenant commerce platform. Each merchant gets an isolated storefront, catalogue, and orders.",
                sections: [
                    {
                        heading: "What we provide",
                        paragraphs: [
                            "Store signup, storefront, checkout, payments, order tools, and optional shipping and WhatsApp integrations.",
                            "Merchants control their products, prices, and fulfilment. Shoppers buy from the individual store, not from a shared marketplace cart.",
                        ],
                    },
                    {
                        heading: "Create a store",
                        paragraphs: [
                            "You can open a store from Create store on this site. Platform pricing on the homepage describes the current trial and monthly plan copy.",
                        ],
                    },
                ],
            };
        case "privacy":
            return {
                eyebrow: "Retail Cosmos",
                title: "Privacy Policy",
                updated: "September 2026",
                intro: "This policy covers the Retail Cosmos website and platform. Each merchant store also has its own privacy page for shopper data on that store.",
                sections: [
                    {
                        heading: "Merchant accounts",
                        paragraphs: [
                            "When you create a store we collect store name, slug, email, phone, and login credentials to operate the tenant account.",
                            "Signup verification may be sent on WhatsApp. Password reset uses email.",
                        ],
                    },
                    {
                        heading: "Shopper data",
                        paragraphs: [
                            "Customer accounts, addresses, and orders belong to the store they shopped. We host that data so the store can fulfil orders. We do not sell it.",
                            "Payment card data is handled by Razorpay. Courier details may be sent to shipping partners when a merchant enables them.",
                        ],
                    },
                    {
                        heading: "Contact",
                        paragraphs: [
                            "For platform privacy questions, use the contact details published by Retail Cosmos. For an order at a specific shop, use that store’s Contact page.",
                        ],
                    },
                ],
            };
        case "terms":
            return {
                eyebrow: "Retail Cosmos",
                title: "Terms of Use",
                updated: "September 2026",
                intro: "These terms apply to the Retail Cosmos website and to merchants who open a store on the platform.",
                sections: [
                    {
                        heading: "Stores",
                        paragraphs: [
                            "Merchants are responsible for their catalogue, legal compliance, fulfilment, and customer support.",
                            "Shopper purchase terms are those of the store they buy from, including that store’s shipping and returns pages.",
                        ],
                    },
                    {
                        heading: "Platform access",
                        paragraphs: [
                            "Do not abuse the service, attack other tenants, or use the platform for unlawful goods.",
                            "Homepage pricing describes the current commercial offer. Billing enforcement may be handled separately from this software.",
                        ],
                    },
                ],
            };
        default:
            return platformLegalDocument("about");
    }
}
