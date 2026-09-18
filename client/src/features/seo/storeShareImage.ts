export const storeShareImage = (
  tenant?: { logo?: string | null } | null,
  bannerImage?: string | null,
): string =>
  (bannerImage || "").trim() || (tenant?.logo || "").trim() || "";
