import type { ReactNode } from "react";
import styles from "./CheckoutMain.module.css";
interface CheckoutMainProps {
  children: ReactNode;
}
const CheckoutMain = ({ children }: CheckoutMainProps) => {
  return <div className={styles.main}>{children}</div>;
};
export default CheckoutMain;
