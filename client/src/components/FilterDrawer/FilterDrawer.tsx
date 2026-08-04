import { X } from "lucide-react";
import styles from "./FilterDrawer.module.css";

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const FilterDrawer = ({
  open,
  onClose,
  children,
}: FilterDrawerProps) => {
  return (
    <>
      {/* Overlay */}
      <div
        className={`${styles.overlay} ${
          open ? styles.show : ""
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={`${styles.drawer} ${
          open ? styles.open : ""
        }`}
      >
        <div className={styles.header}>
          <h2>Filters</h2>

          <button onClick={onClose}>
            <X size={22} />
          </button>
        </div>

        <div className={styles.body}>
          {children}
        </div>
      </aside>
    </>
  );
};

export default FilterDrawer;