import React, { useEffect, useRef, useState } from "react";
import styles from "./CategorySlider.module.css";
import {
  getCategories,
  type Category,
} from "../../features/home/api/category.api";

interface CategorySliderProps {
  tenantId: string;
  onCategoryClick?: (category: Category) => void;
}

export default function CategorySlider({
  tenantId,
  onCategoryClick,
}: CategorySliderProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      try {
        setLoading(true);
        setError("");

        const data = await getCategories(tenantId);

        if (mounted) {
          setCategories(data);
        }
      } catch (err) {
        console.error("Failed to load categories:", err);

        if (mounted) {
          setError("Unable to load categories.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    if (tenantId) {
      loadCategories();
    }

    return () => {
      mounted = false;
    };
  }, [tenantId]);

  const scrollLeft = () => {
    sliderRef.current?.scrollBy({
      left: -500,
      behavior: "smooth",
    });
  };

  const scrollRight = () => {
    sliderRef.current?.scrollBy({
      left: 500,
      behavior: "smooth",
    });
  };

  if (loading) {
    return (
      <section className={styles.section}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Explore</span>
            <h2 className={styles.title}>Shop by Category</h2>
          </div>
        </div>

        <div className={styles.slider}>
          {Array.from({ length: 6 }).map((_, index) => (
            <div className={styles.skeletonCard} key={index}>
              <div className={styles.skeletonImage} />
              <div className={styles.skeletonText} />
              <div className={styles.skeletonTextSmall} />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.section}>
        <div className={styles.error}>{error}</div>
      </section>
    );
  }

  if (!categories.length) {
    return null;
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headingArea}>
          <span className={styles.eyebrow}>Explore</span>

          <div className={styles.titleRow}>
            <h2 className={styles.title}>Shop by Category</h2>

            <span className={styles.count}>
              {categories.length} categories
            </span>
          </div>
        </div>

        <div className={styles.navigation}>
          <button
            type="button"
            className={styles.arrow}
            onClick={scrollLeft}
            aria-label="Previous categories"
          >
            <Arrow direction="left" />
          </button>

          <button
            type="button"
            className={styles.arrow}
            onClick={scrollRight}
            aria-label="Next categories"
          >
            <Arrow direction="right" />
          </button>
        </div>
      </div>

      <div className={styles.sliderWrapper}>
        <div ref={sliderRef} className={styles.slider}>
          {categories.map((category) => (
            <button
              key={category._id}
              type="button"
              className={styles.categoryCard}
              onClick={() => onCategoryClick?.(category)}
            >
              <div className={styles.imageWrapper}>
                {category.image ? (
                  <img
                    src={category.image}
                    alt={category.name}
                    className={styles.image}
                    loading="lazy"
                  />
                ) : (
                  <div className={styles.placeholder}>
                    <span>
                      {category.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}

                <div className={styles.imageOverlay} />
              </div>

              <div className={styles.cardContent}>
                <span className={styles.categoryName}>
                  {formatCategoryName(category.name)}
                </span>

                <span className={styles.exploreText}>
                  Explore
                  <Arrow direction="right" />
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatCategoryName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function Arrow({
  direction,
}: {
  direction: "left" | "right";
}) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      style={{
        transform:
          direction === "left"
            ? "rotate(180deg)"
            : "none",
      }}
    >
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}