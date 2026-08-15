import type { ReactNode } from "react";
import styles from "./CheckoutLayout.module.css";
interface CheckoutLayoutProps {
  main: ReactNode;
  sidebar: ReactNode;
}
const CheckoutLayout = ({ main, sidebar }: CheckoutLayoutProps) => {
  return (
    <div className={styles.layout}>
      <main className={styles.main}>{main}</main>
      <aside className={styles.sidebar}>{sidebar}</aside>
    </div>
  );
};
export default CheckoutLayout;
