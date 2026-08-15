import React from "react";
import styles from "../../styles/Footer.module.css";
const FOOTER_COLUMNS = [
  {
    heading: "Shop",
    links: ["New Arrivals", "Best Sellers", "Collections", "Sale"],
  },
  {
    heading: "Support",
    links: ["Help Center", "Shipping Info", "Returns", "Contact Us"],
  },
  {
    heading: "Legal",
    links: ["Terms of Use", "Privacy Policy", "Cookie Policy", "Accessibility"],
  },
];
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
     
        <div className={styles.brandColumn}>
          <a href="/" className={styles.logo}>
            <span className={styles.logoIcon} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M12 3a9 9 0 1 0 9 9c0-.34-.02-.67-.05-1A7 7 0 0 1 12 3z"
                  fill="currentColor"
                />
              </svg>
            </span>
            <span className={styles.logoText}>Lunar Tech</span>
          </a>
          <p className={styles.tagline}>
            Defining the future of e-commerce with premium, curated experiences
            for modern brands and their customers.
          </p>
          <div className={styles.socials}>
            <a href="#" className={styles.socialLink} aria-label="Instagram">
              <InstagramIcon />
            </a>
            <a href="#" className={styles.socialLink} aria-label="Twitter">
              <TwitterIcon />
            </a>
            <a href="#" className={styles.socialLink} aria-label="Facebook">
              <FacebookIcon />
            </a>
          </div>
        </div>
     
        <div className={styles.linkColumns}>
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.heading} className={styles.linkColumn}>
              <h3 className={styles.columnHeading}>{col.heading}</h3>
              <ul className={styles.linkList}>
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href={`/${link.toLowerCase().replace(/\s+/g, "-")}`}
                      className={styles.footerLink}
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.bottomBar}>
        <p className={styles.copyright}>
          © {year} Lunar Tech SaaS. All rights reserved.
        </p>
        <div className={styles.bottomLinks}>
          <button type="button" className={styles.bottomLinkButton}>
            <GlobeIcon />
            English (US)
          </button>
          <button type="button" className={styles.bottomLinkButton}>
            USD ($)
          </button>
        </div>
      </div>
    </footer>
  );
}
function InstagramIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" />
    </svg>
  );
}
function TwitterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M22 5.9c-.7.3-1.5.6-2.3.7.8-.5 1.4-1.3 1.7-2.3-.8.5-1.7.8-2.6 1a4.1 4.1 0 0 0-7 3.7A11.6 11.6 0 0 1 3.4 4.6a4.1 4.1 0 0 0 1.3 5.5c-.7 0-1.3-.2-1.9-.5v.1c0 2 1.4 3.6 3.3 4a4.2 4.2 0 0 1-1.9.1 4.1 4.1 0 0 0 3.8 2.9A8.2 8.2 0 0 1 2 18.4a11.6 11.6 0 0 0 6.3 1.8c7.5 0 11.7-6.3 11.7-11.7v-.5c.8-.6 1.5-1.3 2-2.1z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function FacebookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M14 8.5h2.5V5.2h-2.5c-2 0-3.5 1.6-3.5 3.5v1.8H8v3.3h2.5V21h3.3v-7.2h2.5l.4-3.3h-2.9V8.7c0-.4.3-.2.2-.2z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3 12h18M12 3c2.5 2.5 3.8 5.8 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.8-3.8-9S9.5 5.5 12 3z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
