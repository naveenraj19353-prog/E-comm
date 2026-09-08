export const routes = {
    home: (tenant: string) => `/${tenant}`,
    products: (tenant: string) => `/${tenant}/products`,
    product: (tenant: string, id: string) => `/${tenant}/product-details/${id}`,
    cart: (tenant: string) => `/${tenant}/cart`,
    wishlist: (tenant: string) => `/${tenant}/wishlist`,
    profile: (tenant: string) => `/${tenant}/profile`,
    customize: (tenant: string) => `/${tenant}/customize`,
    checkout: (tenant: string) => `/${tenant}/checkout`,
    thankYou: (tenant: string, orderId: string) => `/${tenant}/thank-you/${orderId}`,
    orders: (tenant: string) => `/${tenant}/orders`,
    orderDetail: (tenant: string, orderId: string) => `/${tenant}/orders/${orderId}`,
};
