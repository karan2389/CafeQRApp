import { S3Client } from "@aws-sdk/client-s3";
import { getAppConfig } from "@/lib/config/env";

let r2ClientInstance: S3Client | null = null;

export function hasR2Configured(): boolean {
  const config = getAppConfig();
  return Boolean(
    config.r2?.accountId &&
    config.r2?.accessKeyId &&
    config.r2?.secretAccessKey &&
    config.r2?.bucketName
  );
}

export function getR2Client(): S3Client {
  if (r2ClientInstance) {
    return r2ClientInstance;
  }

  const config = getAppConfig();
  const accountId = config.r2?.accountId;
  const accessKeyId = config.r2?.accessKeyId;
  const secretAccessKey = config.r2?.secretAccessKey;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("[CloudflareR2] Missing R2 credentials in environment (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY)");
  }

  r2ClientInstance = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return r2ClientInstance;
}
