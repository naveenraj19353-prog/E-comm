import { FaLinkedinIn, FaFacebook, FaInstagramSquare, FaTwitterSquare, } from "react-icons/fa";
import styles from "./Footer.module.css";
import type { FooterProps } from "./types";
import { useLayoutSettings } from "../../theme/useThemeSettings";

const Footer = ({ companyName, description, sections }: FooterProps) => {
    const layoutSettings = useLayoutSettings();
    const footerClass = layoutSettings.footerLayout === "minimal"
        ? `${styles.footer} ${styles.footerMinimal}`
        : layoutSettings.footerLayout === "compact"
            ? `${styles.footer} ${styles.footerCompact}`
            : styles.footer;

    if (layoutSettings.footerLayout === "minimal") {
        return (
            <footer className={footerClass}>
                <div className={styles.bottom}>
                    © {new Date().getFullYear()} {companyName}. All rights reserved.
                </div>
            </footer>
        );
    }

    return (<footer className={footerClass}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <h2>{companyName}</h2>
          <p>{description}</p>
          {layoutSettings.showFooterSocial && (<div className={styles.socials}>
            <FaFacebook size={20}/>
            <FaInstagramSquare size={20}/>
            <FaTwitterSquare size={20}/>
            <FaLinkedinIn size={20}/>
          </div>)}
        </div>
        {layoutSettings.showFooterLinks && sections.map((section) => (<div key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.links.map((link) => (<li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>))}
            </ul>
          </div>))}
      </div>
      <div className={styles.bottom}>
        © {new Date().getFullYear()} {companyName}. All rights reserved.
      </div>
    </footer>);
};
export default Footer;
