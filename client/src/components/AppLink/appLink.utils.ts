export function isExternalHref(href: string): boolean {
  return /^(https?:|mailto:|tel:|\/\/)/i.test(href.trim());
}
