import { useEffect } from "react";

/** Inject / update a JSON-LD script tag in document.head. */
export const useJsonLd = ({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown> | Record<string, unknown>[] | null | undefined;
}) => {
  const serialized =
    data && (Array.isArray(data) ? data.length > 0 : Object.keys(data).length > 0)
      ? JSON.stringify(data)
      : "";

  useEffect(() => {
    const scriptId = `jsonld-${id}`;
    if (!serialized) {
      document.getElementById(scriptId)?.remove();
      return;
    }

    let el = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!el) {
      el = document.createElement("script");
      el.type = "application/ld+json";
      el.id = scriptId;
      document.head.appendChild(el);
    }
    el.textContent = serialized;

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [id, serialized]);
};

export const buildProductJsonLd = (input: {
  name: string;
  description: string;
  url: string;
  image?: string | null;
  brand?: string;
  sku?: string;
  price?: number;
  currency?: string;
  availability?: "InStock" | "OutOfStock";
  ratingValue?: number;
  reviewCount?: number;
}) => {
  const offer =
    typeof input.price === "number"
      ? {
          "@type": "Offer",
          priceCurrency: input.currency || "INR",
          price: input.price,
          availability: `https://schema.org/${input.availability || "InStock"}`,
          url: input.url,
        }
      : undefined;

  const aggregateRating =
    typeof input.ratingValue === "number" &&
    typeof input.reviewCount === "number" &&
    input.reviewCount > 0
      ? {
          "@type": "AggregateRating",
          ratingValue: input.ratingValue,
          reviewCount: input.reviewCount,
        }
      : undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    description: input.description,
    url: input.url,
    ...(input.image ? { image: [input.image] } : {}),
    ...(input.brand
      ? { brand: { "@type": "Brand", name: input.brand } }
      : {}),
    ...(input.sku ? { sku: input.sku } : {}),
    ...(offer ? { offers: offer } : {}),
    ...(aggregateRating ? { aggregateRating } : {}),
  };
};

export const buildOrganizationJsonLd = (input: {
  name: string;
  url: string;
  description?: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: input.name,
  url: input.url,
  ...(input.description ? { description: input.description } : {}),
});

export const buildWebSiteJsonLd = (input: {
  name: string;
  url: string;
  searchUrlTemplate?: string;
}) => ({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: input.name,
  url: input.url,
  ...(input.searchUrlTemplate
    ? {
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: input.searchUrlTemplate,
          },
          "query-input": "required name=search_term_string",
        },
      }
    : {}),
});
