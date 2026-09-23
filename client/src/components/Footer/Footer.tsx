import {
  FaLinkedinIn,
  FaFacebook,
  FaInstagramSquare,
  FaTwitterSquare,
} from "react-icons/fa";
import styles from "./Footer.module.css";
import type { FooterProps } from "./types";
import { useLayoutSettings } from "../../theme/useThemeSettings";
import AppLink from "../AppLink";
import { isExternalHref } from "../AppLink/appLink.utils";
import { storefrontHref } from "../../routes/routes";
import { useStorefrontTenant } from "../../features/tenant/useTenant";
import {
  filterFooterSectionsForBusiness,
  resolveFooterHref,
} from "../../theme/footerDefaults";

/** Copyright owner shown in every storefront footer. */
const PLATFORM_NAME = "Retail Cosmos";

const Footer = ({ companyName, description, sections }: FooterProps) => {
  const layoutSettings = useLayoutSettings();
  const { tenantSlug, tenant } = useStorefrontTenant();
  // Only render links whose pages exist for this store type (retail / service / menu).
  const visibleSections = filterFooterSectionsForBusiness(
    sections,
    tenant?.businessType,
  );
  const footerClass =
    layoutSettings.footerLayout === "minimal"
      ? `${styles.footer} ${styles.footerMinimal}`
      : layoutSettings.footerLayout === "compact"
        ? `${styles.footer} ${styles.footerCompact}`
        : styles.footer;

  if (layoutSettings.footerLayout === "minimal") {
    return (
      <footer className={footerClass}>
        <div className={styles.bottom}>
          © {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
        </div>
      </footer>
    );
  }

  return (
    <footer className={footerClass}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <h2>{companyName}</h2>
          <p>{description}</p>
          {layoutSettings.showFooterSocial && (
            <div className={styles.socials}>
              <FaFacebook size={20} />
              <FaInstagramSquare size={20} />
              <FaTwitterSquare size={20} />
              <FaLinkedinIn size={20} />
            </div>
          )}
        </div>
        {layoutSettings.showFooterLinks &&
          visibleSections.map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.links.map((link) => {
                  const href = resolveFooterHref(link.label, link.href);
                  if (!href) {
                    return null;
                  }
                  const to =
                    isExternalHref(href) || href.startsWith("#")
                      ? href
                      : storefrontHref(tenantSlug, href);
                  return (
                    <li key={link.label}>
                      <AppLink to={to}>{link.label}</AppLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
      </div>
      <div className={styles.bottom}>
        © {new Date().getFullYear()} {PLATFORM_NAME}. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
