import { useState } from "react";
import { Search } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import styles from "./SearchBar.module.css";

interface SearchBarProps {
  placeholder?: string;
}

const SearchBar = ({ placeholder = "Search products..." }: SearchBarProps) => {
  const navigate = useNavigate();

  const { tenantSlug } = useParams();

  const [value, setValue] = useState("");

  const handleSearch = () => {
    const search = value.trim();

    if (!search) {
      return;
    }

    navigate(`/${tenantSlug}/products?search=${encodeURIComponent(search)}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className={styles.wrapper}>
      <Search size={18} className={styles.icon} />

      <input
        className={styles.input}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
      />
    </div>
  );
};

export default SearchBar;
