import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/config/env";
import type { Database } from "@/types/database";

let adminClientInstance: SupabaseClient<Database> | null = null;

/**
 * Returns a privileged Supabase client with service_role permissions.
 * WARNING: NEVER call this function on client-side / browser components.
 * Only use in server actions, protected route handlers, or server scripts.
 */
export function getAdminClient(): SupabaseClient<Database> {
  if (typeof window !== "undefined") {
    throw new Error("[SupabaseAdmin] Service role client must never be instantiated in the browser!");
  }

  if (adminClientInstance) {
    return adminClientInstance;
  }

  const config = getAppConfig();
  const url = config.supabase?.url;
  const serviceRoleKey = config.supabase?.serviceRoleKey;

  if (!url || !serviceRoleKey) {
    throw new Error("[SupabaseAdmin] SUPABASE_SERVICE_ROLE_KEY is required for privileged server operations.");
  }

  adminClientInstance = createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return adminClientInstance;
}

export function hasAdminClientConfigured(): boolean {
  const config = getAppConfig();
  return Boolean(config.supabase?.url && config.supabase?.serviceRoleKey);
}

