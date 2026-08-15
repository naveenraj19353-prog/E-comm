import { X } from "lucide-react";
import styles from "./FilterDrawer.module.css";
interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  onClear?: () => void;
}
const FilterDrawer = ({
  open,
  onClose,
  children,
  onClear,
}: FilterDrawerProps) => {
  return (
    <>
      
      <div
        className={`${styles.overlay} ${open ? styles.overlayVisible : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      
      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ""}`}
        aria-hidden={!open}
        aria-label="Product filters"
      >
        
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2>Filters</h2>
            <p>Refine your products</p>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close filters"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className={styles.content}>{children}</div>
        
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClear}
          >
            Clear All
          </button>
          <button
            type="button"
            className={styles.applyButton}
            onClick={onClose}
          >
            Apply Filters
          </button>
        </div>
      </aside>
    </>
  );
};
export default FilterDrawer;
