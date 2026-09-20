export const PRODUCT_MEDIA_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime";

export const BANNER_MEDIA_ACCEPT = PRODUCT_MEDIA_ACCEPT;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov)$/i;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export function isVideoSrc(src?: string | null, mediaType?: string | null) {
  const path = String(src || "").split("?")[0].split("#")[0].toLowerCase();
  if (VIDEO_EXT.test(path)) return true;
  return mediaType === "video";
}

export function photoSources(sources: string[]) {
  return sources.filter((src) => typeof src === "string" && src.trim() && !isVideoSrc(src));
}

/** Listing card: video first, then photos. */
export function listingSwiperSources(sources: string[]) {
  const items = (sources || []).filter((src) => typeof src === "string" && src.trim());
  const videos = items.filter((src) => isVideoSrc(src));
  const photos = items.filter((src) => !isVideoSrc(src));
  if (videos[0]) {
    return [videos[0], ...photos];
  }
  return photos;
}

export function isAllowedProductMediaFile(file: File) {
  const type = String(file.type || "").toLowerCase();
  const isImage = type.startsWith("image/");
  const isVideo = type.startsWith("video/") || VIDEO_EXT.test(file.name);
  if (!isImage && !isVideo) return false;
  return file.size <= (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES);
}
