import type { FooterProps } from "./types";

export const footerData: FooterProps = {
  companyName: "OmniStore",

  description:
    "Discover premium fashion, accessories and lifestyle products with secure shopping and fast delivery.",

  sections: [
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
  ],
};