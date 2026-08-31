import type { ComponentProps } from "react";
import ProductImage from "../ProductImage";
import { DEFAULT_CATEGORY_IMAGE } from "../../constants/images";

type CategoryImageProps = ComponentProps<typeof ProductImage>;

export default function CategoryImage(props: CategoryImageProps) {
    return (
        <ProductImage
            fallbackSrc={DEFAULT_CATEGORY_IMAGE}
            placeholderLabel="Category"
            {...props}
        />
    );
}
