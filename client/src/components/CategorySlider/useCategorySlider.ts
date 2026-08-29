import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./CategorySlider.module.css";
import { getCategories, type Category } from "../../features/home/api/category.api";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
    AUTO_SLIDE_INTERVAL,
    CATEGORY_SLIDER_MOBILE_QUERY,
    clampIndex,
    DESKTOP_SLIDE_COUNT,
    DESKTOP_VISIBLE_COUNT,
    getNextSliderIndex,
    getPreviousSliderIndex,
} from "./categorySlider.utils";

export function useCategorySlider(tenantId: string) {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isHovered, setIsHovered] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);
    const isMobile = useMediaQuery(CATEGORY_SLIDER_MOBILE_QUERY);
    const visibleCount = isMobile ? 1 : DESKTOP_VISIBLE_COUNT;
    const slideCount = isMobile ? 1 : DESKTOP_SLIDE_COUNT;
    const maxIndex = Math.max(0, categories.length - visibleCount);

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

    const scrollToIndex = useCallback((index: number) => {
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
    }, []);

    const moveToIndex = useCallback((index: number) => {
        const nextIndex = clampIndex(index, maxIndex);
        setCurrentIndex(nextIndex);
        scrollToIndex(nextIndex);
    }, [maxIndex, scrollToIndex]);

    useEffect(() => {
        setCurrentIndex((previousIndex) => Math.min(previousIndex, maxIndex));
    }, [maxIndex]);

    const handlePrevious = useCallback(() => {
        moveToIndex(getPreviousSliderIndex(currentIndex, maxIndex, slideCount));
    }, [currentIndex, maxIndex, moveToIndex, slideCount]);

    const handleNext = useCallback(() => {
        moveToIndex(getNextSliderIndex(currentIndex, maxIndex, slideCount));
    }, [currentIndex, maxIndex, moveToIndex, slideCount]);

    useEffect(() => {
        if (loading || categories.length <= visibleCount || isHovered) {
            return;
        }
        const interval = window.setInterval(() => {
            setCurrentIndex((previousIndex) => {
                const nextIndex = getNextSliderIndex(previousIndex, maxIndex, slideCount);
                scrollToIndex(nextIndex);
                return nextIndex;
            });
        }, AUTO_SLIDE_INTERVAL);
        return () => {
            window.clearInterval(interval);
        };
    }, [categories.length, isHovered, loading, maxIndex, scrollToIndex, slideCount, visibleCount]);

    return {
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
    };
}
