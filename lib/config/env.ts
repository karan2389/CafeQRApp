export interface AppConfig {
  isProduction: boolean;
  r2?: {
    accountId?: string;
    bucketName?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
  };
}

export function getAppConfig(): AppConfig {
  return {
    isProduction: process.env.NODE_ENV === "production",
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
      bucketName: process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || "cafeqr",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      publicUrl: process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    },
  };
}
