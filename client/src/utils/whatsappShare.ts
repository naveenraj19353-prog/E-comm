/** Build a WhatsApp click-to-chat URL with a prefilled message. */
export const buildWhatsAppShareUrl = (text: string): string =>
  `https://wa.me/?text=${encodeURIComponent(text.trim())}`;

export const buildProductWhatsAppText = (input: {
  name: string;
  price?: number;
  url: string;
  storeName?: string;
}): string => {
  const lines = [`Check out ${input.name}`];
  if (input.storeName?.trim()) {
    lines[0] += ` on ${input.storeName.trim()}`;
  }
  lines[0] += "!";

  if (typeof input.price === "number" && Number.isFinite(input.price)) {
    lines.push(`₹${input.price.toLocaleString("en-IN")}`);
  }

  lines.push(input.url);
  return lines.join("\n");
};

export const openWhatsAppShare = (text: string) => {
  const url = buildWhatsAppShareUrl(text);
  window.open(url, "_blank", "noopener,noreferrer");
};
