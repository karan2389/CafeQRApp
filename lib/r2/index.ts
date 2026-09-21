import { getAppConfig } from "@/lib/config/env";

/**
 * Resolves menu item image keys to accessible URLs.
 * If the image is a relative path (e.g. `/menu/cortado.svg`), it is returned directly.
 * If Cloudflare R2 is configured and the image is an object key, prepends the public R2 domain.
 */
export function resolveImageUrl(imageKeyOrPath: string): string {
  if (imageKeyOrPath.startsWith("/") || imageKeyOrPath.startsWith("http://") || imageKeyOrPath.startsWith("https://")) {
    return imageKeyOrPath;
  }

  const { r2 } = getAppConfig();
  if (r2?.publicUrl) {
    const base = r2.publicUrl.endsWith("/") ? r2.publicUrl : `${r2.publicUrl}/`;
    return `${base}${imageKeyOrPath}`;
  }

  return imageKeyOrPath;
}
