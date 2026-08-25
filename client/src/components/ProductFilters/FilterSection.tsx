import { useState } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./FilterSection.module.css";
interface Props {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}
const FilterSection = ({ title, children, defaultOpen = true }: Props) => {
    const [open, setOpen] = useState(defaultOpen);
    return (<div className={styles.section}>
      <button className={styles.header} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <ChevronDown size={18} className={`${styles.icon} ${open ? styles.rotate : ""}`}/>
      </button>
      {open && <div className={styles.content}>{children}</div>}
    </div>);
};
export default FilterSection;
