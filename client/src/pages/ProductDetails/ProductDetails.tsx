import { useParams } from "react-router-dom";

import { useProductDetails } from "../../features/products/hooks/useProductDetails";

import ProductDetailsView from "./ProductDetailsView";

const ProductDetails = () => {
  const { productId } = useParams<{
    productId: string;
  }>();

  const tenantId = "TENANT001";

  const {
    data,
    isLoading,
    isError,
  } = useProductDetails(
    productId ?? "",
    tenantId
  );

  if (isLoading) {
    return (
      <div>
        Loading product...
      </div>
    );
  }

  if (isError || !data?.data) {
    return (
      <div>
        Product not found.
      </div>
    );
  }

  return (
    <ProductDetailsView
      product={data.data}
    />
  );
};

export default ProductDetails;