import { useAppSelector } from "../app/hooks";
import { useCategory } from "../features/products/hooks/useCategory";
import { useProducts } from "../features/products/hooks/useProducts";

const Home = () => {
  const tenantSlug = useAppSelector(
    (state) => state.tenant.tenantSlug
  );

  const { data, isLoading, isError, refetch } =
  useProducts("TENANT001");
  const { data:category} =
  useCategory("TENANT001");
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (isError) {
    return (
      <div>
        Failed to load products.
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }
  console.log(data)
  return (
    <div>
      {/* {data?.data?.map((product: any) => (
        <div key={product.id}>{product.name}</div>
      ))} */}
    </div>
  );
};

export default Home;