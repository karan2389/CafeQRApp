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
    publicUrl?: string;
  };
}

export function getAppConfig(): AppConfig {
  return {
    isProduction: process.env.NODE_ENV === "production",
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    r2: {
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      bucketName: process.env.CLOUDFLARE_R2_BUCKET,
      publicUrl: process.env.NEXT_PUBLIC_R2_PUBLIC_URL,
    },
  };
}
