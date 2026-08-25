import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import styles from "./SortDropdown.module.css";
export type SortOption = "newest" | "priceAsc" | "priceDesc" | "rating" | "discount";
interface SortDropdownProps {
    value: SortOption;
    onChange: (value: SortOption) => void;
}
const options = [
    { value: "newest", label: "Newest" },
    { value: "priceAsc", label: "Price : Low to High" },
    { value: "priceDesc", label: "Price : High to Low" },
    { value: "rating", label: "Highest Rated" },
    { value: "discount", label: "Biggest Discount" },
] as const;
const SortDropdown = ({ value, onChange }: SortDropdownProps) => {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (!ref.current?.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);
    const selected = options.find((item) => item.value === value) ?? options[0];
    return (<div className={styles.wrapper} ref={ref}>
      <button className={styles.trigger} onClick={() => setOpen(!open)}>
        <span>
          <strong>Sort:</strong> {selected.label}
        </span>
        <ChevronDown size={18} className={`${styles.icon} ${open ? styles.rotate : ""}`}/>
      </button>
      {open && (<div className={styles.menu}>
          {options.map((option) => (<button key={option.value} className={`${styles.option} ${option.value === value ? styles.active : ""}`} onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                }}>
              <span>{option.label}</span>
              {option.value === value && <Check size={16}/>}
            </button>))}
        </div>)}
    </div>);
};
export default SortDropdown;
