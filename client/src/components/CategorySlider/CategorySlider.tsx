import { useEffect, useRef, useState } from "react";
import styles from "./CategorySlider.module.css";
import { getCategories, type Category, } from "../../features/home/api/category.api";
interface CategorySliderProps {
    tenantId: string;
    onCategoryClick?: (category: Category) => void;
}
const DESKTOP_VISIBLE_COUNT = 5;
const DESKTOP_SLIDE_COUNT = 3;
const MOBILE_MEDIA_QUERY = "(max-width: 37.5rem)";
const AUTO_SLIDE_INTERVAL = 3000;

function useIsMobileCategorySlider() {
    const [isMobile, setIsMobile] = useState(() => window.matchMedia(MOBILE_MEDIA_QUERY).matches);
    useEffect(() => {
        const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
        const handleChange = () => setIsMobile(mediaQuery.matches);
        mediaQuery.addEventListener("change", handleChange);
        return () => mediaQuery.removeEventListener("change", handleChange);
    }, []);
    return isMobile;
}

export default function CategorySlider({ tenantId, onCategoryClick, }: CategorySliderProps) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobileCategorySlider();
    const visibleCount = isMobile ? 1 : DESKTOP_VISIBLE_COUNT;
    const slideCount = isMobile ? 1 : DESKTOP_SLIDE_COUNT;
    useEffect(() => {
        if (!tenantId) {
            return;
        }
        let mounted = true;
        const loadCategories = async () => {
            try {
                setLoading(true);
                setError("");
                const data = await getCategories(tenantId);
                if (mounted) {
                    setCategories(data);
                    setCurrentIndex(0);
                }
            }
            catch (err) {
                console.error("Failed to load categories:", err);
                if (mounted) {
                    setError("Unable to load categories.");
                }
            }
            finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        };
        loadCategories();
        return () => {
            mounted = false;
        };
    }, [tenantId]);
    const maxIndex = Math.max(0, categories.length - visibleCount);

    const scrollToIndex = (index: number) => {
        const slider = sliderRef.current;
        if (!slider) {
            return;
        }
        const card = slider.querySelector(`.${styles.categoryCard}`) as HTMLElement | null;
        if (!card) {
            return;
        }
        const gapValue = Number.parseFloat(getComputedStyle(slider).columnGap || getComputedStyle(slider).gap || "0");
        const gap = Number.isFinite(gapValue) ? gapValue : 0;
        slider.scrollTo({
            left: index * (card.offsetWidth + gap),
            behavior: "smooth",
        });
    };

    const moveToIndex = (index: number) => {
        const nextIndex = Math.max(0, Math.min(index, maxIndex));
        setCurrentIndex(nextIndex);
        scrollToIndex(nextIndex);
    };

    useEffect(() => {
        setCurrentIndex((previousIndex) => Math.min(previousIndex, maxIndex));
    }, [maxIndex]);

    const handlePrevious = () => {
        if (currentIndex === 0) {
            moveToIndex(maxIndex);
            return;
        }
        moveToIndex(Math.max(0, currentIndex - slideCount));
    };
    const handleNext = () => {
        if (currentIndex >= maxIndex) {
            moveToIndex(0);
            return;
        }
        moveToIndex(Math.min(maxIndex, currentIndex + slideCount));
    };
    useEffect(() => {
        if (loading || categories.length <= visibleCount || isHovered) {
            return;
        }
        const interval = window.setInterval(() => {
            setCurrentIndex((previousIndex) => {
                const nextIndex = previousIndex >= maxIndex
                    ? 0
                    : Math.min(maxIndex, previousIndex + slideCount);
                scrollToIndex(nextIndex);
                return nextIndex;
            });
        }, AUTO_SLIDE_INTERVAL);
        return () => {
            window.clearInterval(interval);
        };
    }, [loading, categories.length, maxIndex, isHovered, slideCount, visibleCount]);
    if (loading) {
        return (<section className={styles.section}>
        <div className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Explore</span>
            <h2 className={styles.title}>Shop by Category</h2>
          </div>
        </div>
        <div className={styles.slider}>
          {Array.from({ length: 5 }).map((_, index) => (<div className={styles.skeletonCard} key={index}>
              <div className={styles.skeletonImage}/>
              <div className={styles.skeletonContent}>
                <div className={styles.skeletonLine}/>
                <div className={styles.skeletonLineSmall}/>
              </div>
            </div>))}
        </div>
      </section>);
    }
    if (error) {
        return (<section className={styles.section}>
        <div className={styles.error}>
          <span>!</span>
          {error}
        </div>
      </section>);
    }
    if (!categories.length) {
        return null;
    }
    return (<section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headingArea}>
          <div className={styles.eyebrowRow}>
            <span className={styles.eyebrow}>Explore</span>
            <span className={styles.liveDot}/>
          </div>
          <div className={styles.titleRow}>
            <div>
              <h2 className={styles.title}>Shop by Category</h2>
              <p className={styles.subtitle}>
                Discover products curated for every part of your lifestyle.
              </p>
            </div>
            <div className={styles.categoryCount}>
              <strong>{categories.length}</strong>
              <span>Categories</span>
            </div>
          </div>
        </div>
        <div className={styles.navigation}>
          <button type="button" className={styles.arrow} onClick={handlePrevious} aria-label="Previous categories">
            <Arrow direction="left"/>
          </button>
          <button type="button" className={styles.arrow} onClick={handleNext} aria-label="Next categories">
            <Arrow direction="right"/>
          </button>
        </div>
      </div>
      <div className={styles.sliderWrapper} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
        <div ref={sliderRef} className={styles.slider}>
          {categories.map((category, index) => (<button key={category._id} type="button" className={styles.categoryCard} onClick={() => onCategoryClick?.(category)}>
              <div className={styles.imageWrapper}>
                {category.image ? (<img src={category.image} alt={category.name} className={styles.image} loading="lazy"/>) : (<div className={styles.placeholder}>
                    <span>{category.name.charAt(0).toUpperCase()}</span>
                  </div>)}
                <div className={styles.gradient}/>
                <span className={styles.index}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className={styles.exploreBadge}>
                  Explore
                  <Arrow direction="right"/>
                </span>
              </div>
              <div className={styles.cardContent}>
                <div>
                  <span className={styles.categoryName}>
                    {formatCategoryName(category.name)}
                  </span>
                  <span className={styles.categoryHint}>Shop collection</span>
                </div>
                <span className={styles.smallArrow}>
                  <Arrow direction="right"/>
                </span>
              </div>
            </button>))}
        </div>
      </div>
      {categories.length > visibleCount && (<div className={styles.bottomBar}>
          <div className={styles.progress}>
            {Array.from({
                length: Math.ceil(categories.length / slideCount),
            }).map((_, index) => {
                const active = Math.floor(currentIndex / slideCount) === index;
                return (<button key={index} type="button" className={`${styles.progressDot} ${active ? styles.progressDotActive : ""}`} onClick={() => moveToIndex(Math.min(index * slideCount, maxIndex))} aria-label={`Go to category group ${index + 1}`}/>);
            })}
          </div>
          <span className={styles.autoText}>
            {isHovered ? "Paused" : "Auto exploring"}
          </span>
        </div>)}
    </section>);
}
function formatCategoryName(name: string) {
    return name
        .replace(/_/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase());
}
function Arrow({ direction }: {
    direction: "left" | "right";
}) {
    return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{
            transform: direction === "left" ? "rotate(180deg)" : "none",
        }}>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>);
}
