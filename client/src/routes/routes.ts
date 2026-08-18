export const routes = {
  home: (tenant: string) => `/${tenant}`,
  products: (tenant: string) => `/${tenant}/products`,
  product: (tenant: string, id: string) => `/${tenant}/products/${id}`,
  cart: (tenant: string) => `/${tenant}/cart`,
  wishlist: (tenant: string) => `/${tenant}/wishlist`,
  profile: (tenant: string) => `/${tenant}/profile`,
};
