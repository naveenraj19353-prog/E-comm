import { useWishlists } from "../features/wishlist/hooks/useWishlist";

const Wishlist = () => {

  const { data } = useWishlists("TENANT001", '6a4c6679ad39d00258ffc0bb');

  console.log("Wishlist data:", data);
  return <h1>Wishlist Page</h1>;
};

export default Wishlist;