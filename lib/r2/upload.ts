import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, hasR2Configured } from "./client";
import { getAppConfig } from "@/lib/config/env";

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

/**
 * Extracts the R2 object key from a full URL or key string if it is stored in R2.
 * Returns null if the URL is not a recognized R2 asset (e.g. local SVG or demo asset).
 */
export function extractR2Key(urlOrKey: string | null | undefined): string | null {
  if (!urlOrKey) return null;
  if (urlOrKey.startsWith("menu/")) return urlOrKey;
  const match = urlOrKey.match(/menu\/[^?#\s]+/);
  return match ? match[0] : null;
}

/**
 * Validates and uploads an image to Cloudflare R2 bucket.
 * Restricted to JPEG, PNG, WebP, AVIF up to 5MB.
 */
export async function uploadMenuImage(
  buffer: Buffer,
  mimeType: string
): Promise<UploadResult> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Invalid image type: ${mimeType}. Allowed formats: JPEG, PNG, WebP, AVIF.`);
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error(`File size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of 5 MB.`);
  }

  const config = getAppConfig();
  const bucketName = config.r2?.bucketName;
  if (!bucketName) {
    throw new Error("[CloudflareR2] R2_BUCKET_NAME is not set in environment.");
  }

  // Derive safe extension
  const extMap: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
  };
  const ext = extMap[mimeType] || "bin";
  const uniqueKey = `menu/${Date.now()}-${crypto.randomUUID()}.${ext}`;

  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueKey,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  let publicUrl = config.r2?.publicUrl?.replace(/\/+$/, "");
  if (!publicUrl) {
    // Fallback URL if custom domain is not yet bound
    publicUrl = `https://${bucketName}.${config.r2?.accountId}.r2.cloudflarestorage.com`;
  }

  const fullUrl = `${publicUrl}/${uniqueKey}`;

  return {
    url: fullUrl,
    key: uniqueKey,
    size: buffer.length,
    mimeType,
  };
}

/**
 * Deletes an image object from the Cloudflare R2 bucket if it is an application R2 asset.
 * Safely ignores demo or non-R2 URLs.
 */
export async function deleteR2Image(urlOrKey: string | null | undefined): Promise<boolean> {
  const key = extractR2Key(urlOrKey);
  if (!key) {
    return false;
  }

  if (!hasR2Configured()) {
    console.warn("[CloudflareR2] Cannot delete image from R2: R2 is not fully configured.");
    return false;
  }

  try {
    const config = getAppConfig();
    const bucketName = config.r2?.bucketName;
    if (!bucketName) return false;

    const client = getR2Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );
    return true;
  } catch (err: unknown) {
    console.error(`[CloudflareR2] Failed to delete object '${key}':`, err);
    return false;
  }
}

