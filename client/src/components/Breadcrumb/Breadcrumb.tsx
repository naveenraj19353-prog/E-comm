import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./Breadcrumb.module.css";
export interface BreadcrumbItem {
  label: string;
  href?: string;
}
interface BreadcrumbProps {
  items: BreadcrumbItem[];
}
const Breadcrumb = ({ items }: BreadcrumbProps) => {
  return (
    <nav className={styles.breadcrumb}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <div key={item.label} className={styles.item}>
            {item.href && !isLast ? (
              <Link to={item.href}>{item.label}</Link>
            ) : (
              <span className={styles.current}>{item.label}</span>
            )}
            {!isLast && <ChevronRight size={16} />}
          </div>
        );
      })}
    </nav>
  );
};
export default Breadcrumb;
