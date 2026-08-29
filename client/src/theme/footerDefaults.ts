import type { FooterContent, FooterSection } from "../components/Footer/types";

export const DEFAULT_FOOTER_SECTIONS: FooterSection[] = [
    {
        title: "Shop",
        links: [
            { label: "Men", href: "#" },
            { label: "Women", href: "#" },
            { label: "Kids", href: "#" },
            { label: "Accessories", href: "#" },
        ],
    },
    {
        title: "Company",
        links: [
            { label: "About", href: "#" },
            { label: "Careers", href: "#" },
            { label: "Contact", href: "#" },
            { label: "Blogs", href: "#" },
        ],
    },
    {
        title: "Support",
        links: [
            { label: "FAQs", href: "#" },
            { label: "Returns", href: "#" },
            { label: "Shipping", href: "#" },
            { label: "Privacy Policy", href: "#" },
        ],
    },
];

export const DEFAULT_FOOTER_DESCRIPTION =
    "Discover premium fashion, accessories and lifestyle products with secure shopping and fast delivery.";

export const buildDefaultFooterContent = (companyName = "Store"): FooterContent => ({
    companyName,
    description: DEFAULT_FOOTER_DESCRIPTION,
    sections: DEFAULT_FOOTER_SECTIONS.map((section) => ({
        title: section.title,
        links: section.links.map((link) => ({ ...link })),
    })),
});
