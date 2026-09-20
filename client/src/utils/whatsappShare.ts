/** Build a WhatsApp click-to-chat URL with a prefilled message. */
export const buildWhatsAppShareUrl = (text: string): string =>
  `https://wa.me/?text=${encodeURIComponent(text.trim())}`;

export const buildProductWhatsAppText = (input: {
  name: string;
  price?: number;
  url: string;
  storeName?: string;
}): string => {
  const store = input.storeName?.trim() || "the store";
  const price =
    typeof input.price === "number" && Number.isFinite(input.price)
      ? ` at ₹${input.price.toLocaleString("en-IN")}`
      : "";
  return [
    `Why wait? *${input.name}* is ready for you ☀️`,
    "",
    `Just grab *${input.name}* from *${store}* and check out when you're ready ❤️`,
    "",
    `Bag it now${price} 🎁`,
    "",
    `HEAD BACK TO ${store.toUpperCase()}`,
    "",
    "CHECKOUT NOW!",
    input.url,
  ].join("\n");
};

export const openWhatsAppShare = (text: string) => {
  const url = buildWhatsAppShareUrl(text);
  window.open(url, "_blank", "noopener,noreferrer");
};
