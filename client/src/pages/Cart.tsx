import { useAppSelector } from "../app/hooks";

const Cart = () => {
  const tenant = useAppSelector((state) => state.tenant);

  console.log(tenant);

  return <h1>Cart</h1>;
};

export default Cart;