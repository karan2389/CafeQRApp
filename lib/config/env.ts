export interface AppConfig {
  isProduction: boolean;
  supabase?: {
    url?: string;
    anonKey?: string;
    serviceRoleKey?: string;
  };
  r2?: {
    accountId?: string;
    bucketName?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
  };
}

function sanitizeSupabaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  let sanitized = url.trim();
  sanitized = sanitized.replace(/\/rest\/v1\/?$/i, "");
  sanitized = sanitized.replace(/\/+$/, "");
  return sanitized;
}

export function getAppConfig(): AppConfig {
  return {
    isProduction: process.env.NODE_ENV === "production",
    supabase: {
      url: sanitizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
    },
    r2: {
      accountId: process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID,
      bucketName: process.env.R2_BUCKET_NAME || process.env.CLOUDFLARE_R2_BUCKET || "cafeqr",
      accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
      publicUrl: process.env.R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    },
  };
}
