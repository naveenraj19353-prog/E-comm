import { useMemo, useState } from "react";
import type { ProductInventory } from "./ProductCard";

export function useProductVariantSelection(inventory: ProductInventory[] = []) {
    const availableInventory = useMemo(() => {
        return inventory
            .filter((item) => Number(item.stock) > 0)
            .map((item) => ({
                ...item,
                color: item.color?.trim() || "Default",
                size: item.size?.trim() || "Standard",
            }));
    }, [inventory]);

    const availableColors = useMemo(() => {
        return [...new Set(availableInventory.map((item) => item.color))];
    }, [availableInventory]);

    const [selectedColorOverride, setSelectedColorOverride] = useState<string | null>(null);
    const selectedColor = useMemo(() => {
        if (selectedColorOverride && availableColors.includes(selectedColorOverride)) {
            return selectedColorOverride;
        }
        return availableColors[0] ?? "";
    }, [availableColors, selectedColorOverride]);

    const availableSizes = useMemo(() => {
        if (!selectedColor) {
            return [];
        }
        return [
            ...new Set(availableInventory
                .filter((item) => item.color === selectedColor)
                .map((item) => item.size)),
        ];
    }, [availableInventory, selectedColor]);

    const [selectedSizeOverride, setSelectedSizeOverride] = useState<string | null>(null);
    const selectedSize = useMemo(() => {
        if (selectedSizeOverride && availableSizes.includes(selectedSizeOverride)) {
            return selectedSizeOverride;
        }
        return availableSizes[0] ?? "";
    }, [availableSizes, selectedSizeOverride]);

    const selectedVariant = useMemo(() => {
        if (!selectedColor || !selectedSize) {
            return undefined;
        }
        return availableInventory.find((item) => item.color === selectedColor && item.size === selectedSize);
    }, [availableInventory, selectedColor, selectedSize]);

    const selectColor = (color: string) => {
        setSelectedColorOverride(color);
        setSelectedSizeOverride(null);
    };

    const selectSize = (size: string) => {
        setSelectedSizeOverride(size);
    };

    return {
        availableColors,
        availableSizes,
        selectedColor,
        selectedSize,
        selectedVariant,
        selectColor,
        selectSize,
    };
}
