import type { PageSeoInput } from "./usePageSeo";
import { usePageSeo } from "./usePageSeo";
import { useJsonLd } from "./jsonLd";

type SeoHeadProps = PageSeoInput & {
  jsonLdId?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[] | null;
};

/** Applies document head SEO (+ optional JSON-LD). Renders nothing. */
export default function SeoHead({
  jsonLdId = "page",
  jsonLd = null,
  ...seo
}: SeoHeadProps) {
  usePageSeo(seo);
  useJsonLd({ id: jsonLdId, data: jsonLd });
  return null;
}
