import {
  FaLinkedinIn,
  FaFacebook,
  FaInstagramSquare,
  FaTwitterSquare,
} from "react-icons/fa";
import styles from "./Footer.module.css";
import type { FooterProps } from "./types";
const Footer = ({ companyName, description, sections }: FooterProps) => {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <div className={styles.brand}>
          <h2>{companyName}</h2>
          <p>{description}</p>
          <div className={styles.socials}>
            <FaFacebook size={20} />
            <FaInstagramSquare size={20} />
            <FaTwitterSquare size={20} />
            <FaLinkedinIn size={20} />
          </div>
        </div>
        {sections.map((section) => (
          <div key={section.title}>
            <h3>{section.title}</h3>
            <ul>
              {section.links.map((link) => (
                <li key={link.label}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className={styles.bottom}>
        © {new Date().getFullYear()} {companyName}. All rights reserved.
      </div>
    </footer>
  );
};
export default Footer;
