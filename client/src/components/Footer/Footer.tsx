import type { IconType } from "react-icons";
import {
  FaLinkedinIn,
  FaFacebook,
  FaInstagramSquare,
  FaTwitterSquare,
  FaYoutube,
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
import {
  activeSocialLinks,
  addressLines,
  type SocialPlatform,
} from "../../features/tenant/storeProfile";

/** Copyright owner shown in every storefront footer. */
const PLATFORM_NAME = "Retail Cosmos";

const SOCIAL_ICONS: Record<SocialPlatform, IconType> = {
  facebook: FaFacebook,
  instagram: FaInstagramSquare,
  x: FaTwitterSquare,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
};

const Footer = ({ companyName, description, sections }: FooterProps) => {
  const layoutSettings = useLayoutSettings();
  const { tenantSlug, tenant } = useStorefrontTenant();
  // Only render links whose pages exist for this store type (retail / service / menu).
  const visibleSections = filterFooterSectionsForBusiness(
    sections,
    tenant?.businessType,
  );
  // Only links the store has set (INT-013); nothing is shown otherwise.
  const socialLinks = activeSocialLinks(tenant?.socialLinks);
  const address = addressLines(tenant?.businessDetails);
  const gstin = tenant?.businessDetails?.gstin;
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
          {address.length || gstin ? (
            <address className={styles.business}>
              {address.map((line) => (
                <span key={line}>{line}</span>
              ))}
              {gstin ? <span>GSTIN: {gstin}</span> : null}
            </address>
          ) : null}
          {layoutSettings.showFooterSocial && socialLinks.length > 0 && (
            <div className={styles.socials}>
              {socialLinks.map(({ key, label, url }) => {
                const Icon = SOCIAL_ICONS[key];
                return (
                  <a key={key} href={url} target="_blank" rel="noopener noreferrer" aria-label={label}>
                    <Icon size={20} />
                  </a>
                );
              })}
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
