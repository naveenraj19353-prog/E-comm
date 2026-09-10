import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const PRIVATE_PATH =
  /\/(login|register|forgot-password|reset-password|cart|checkout|wishlist|profile|orders|thank-you|customize)(\/|$)/i;

/**
 * Marks account / checkout surfaces as noindex without overriding public page titles.
 */
export default function StorefrontSeoDefaults() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (!PRIVATE_PATH.test(pathname)) {
      return;
    }

    let el = document.head.querySelector(
      'meta[name="robots"]',
    ) as HTMLMetaElement | null;
    if (!el) {
      el = document.createElement("meta");
      el.setAttribute("name", "robots");
      document.head.appendChild(el);
    }
    el.content = "noindex, nofollow";
    document.title = document.title || "Account | Retail Cosmos";
  }, [pathname]);

  return null;
}
