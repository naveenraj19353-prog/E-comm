import { Search } from "lucide-react";
import styles from "./SearchBar.module.css";

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar = ({
  placeholder = "Search products...",
}: SearchBarProps) => {
  return (
    <div className={styles.container}>
      <Search className={styles.icon} size={18} />

      <input
        className={styles.input}
        placeholder={placeholder}
      />
    </div>
  );
};

export default SearchBar;