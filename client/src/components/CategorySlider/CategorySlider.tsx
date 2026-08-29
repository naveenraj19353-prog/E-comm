import styles from "./CategorySlider.module.css";
import type { Category } from "../../features/home/api/category.api";
import { CategoryArrow } from "./categorySliderIcons";
import { formatCategoryName } from "./categorySlider.utils";
import { useCategorySlider } from "./useCategorySlider";

interface CategorySliderProps {
    tenantId: string;
    onCategoryClick?: (category: Category) => void;
}

export default function CategorySlider({ tenantId, onCategoryClick }: CategorySliderProps) {
    const {
        categories,
        loading,
        error,
        currentIndex,
        isHovered,
        setIsHovered,
        sliderRef,
        visibleCount,
        slideCount,
        maxIndex,
        moveToIndex,
        handlePrevious,
        handleNext,
    } = useCategorySlider(tenantId);

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
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div className={styles.skeletonCard} key={index}>
                            <div className={styles.skeletonImage} />
                            <div className={styles.skeletonContent}>
                                <div className={styles.skeletonLine} />
                                <div className={styles.skeletonLineSmall} />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        );
    }

    if (error) {
        return (
            <section className={styles.section}>
                <div className={styles.error}>
                    <span>!</span>
                    {error}
                </div>
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
                    <div className={styles.eyebrowRow}>
                        <span className={styles.eyebrow}>Explore</span>
                        <span className={styles.liveDot} />
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
                        <CategoryArrow direction="left" />
                    </button>
                    <button type="button" className={styles.arrow} onClick={handleNext} aria-label="Next categories">
                        <CategoryArrow direction="right" />
                    </button>
                </div>
            </div>
            <div
                className={styles.sliderWrapper}
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
            >
                <div ref={sliderRef} className={styles.slider}>
                    {categories.map((category, index) => (
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
                                        <span>{category.name.charAt(0).toUpperCase()}</span>
                                    </div>
                                )}
                                <div className={styles.gradient} />
                                <span className={styles.index}>
                                    {String(index + 1).padStart(2, "0")}
                                </span>
                                <span className={styles.exploreBadge}>
                                    Explore
                                    <CategoryArrow direction="right" />
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
                                    <CategoryArrow direction="right" />
                                </span>
                            </div>
                        </button>
                    ))}
                </div>
            </div>
            {categories.length > visibleCount && (
                <div className={styles.bottomBar}>
                    <div className={styles.progress}>
                        {Array.from({ length: Math.ceil(categories.length / slideCount) }).map((_, index) => {
                            const active = Math.floor(currentIndex / slideCount) === index;
                            return (
                                <button
                                    key={index}
                                    type="button"
                                    className={`${styles.progressDot} ${active ? styles.progressDotActive : ""}`}
                                    onClick={() => moveToIndex(Math.min(index * slideCount, maxIndex))}
                                    aria-label={`Go to category group ${index + 1}`}
                                />
                            );
                        })}
                    </div>
                    <span className={styles.autoText}>
                        {isHovered ? "Paused" : "Auto exploring"}
                    </span>
                </div>
            )}
        </section>
    );
}
