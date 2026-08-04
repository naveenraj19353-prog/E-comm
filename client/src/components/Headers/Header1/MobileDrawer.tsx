import { useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, ShoppingCart, User } from "lucide-react";

import styles from "./MobileDrawer.module.css";
import { navItems } from "./navItems";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
}

const MobileDrawer = ({ open, onClose }: MobileDrawerProps) => {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "auto";

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [open]);

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEsc);

    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.aside
            className={styles.drawer}
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{
              duration: 0.35,
              ease: "easeInOut",
            }}
          >
            <div className={styles.header}>
              <h2>Lunar Tech</h2>

              <button onClick={onClose}>
                <X size={22} />
              </button>
            </div>

            <nav className={styles.menu}>
              {navItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.path}
                  onClick={onClose}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className={styles.bottom}>
              <button>
                <Heart size={20} />
                Wishlist
              </button>

              <button>
                <ShoppingCart size={20} />
                Cart
              </button>

              <button>
                <User size={20} />
                Profile
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};

export default MobileDrawer;