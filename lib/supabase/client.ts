import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAppConfig } from "@/lib/config/env";
import type { Database } from "@/types/database";

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Returns true if the public Supabase URL and anonymous key are configured in the environment.
 */
export function hasSupabaseConfigured(): boolean {
  const config = getAppConfig();
  return Boolean(config.supabase?.url && config.supabase?.anonKey);
}

/**
 * Returns a reusable singleton Supabase client instance typed with Database schema.
 * Returns null if Supabase environment variables are missing or unconfigured.
 * Never exposes or uses service-role credentials.
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (!hasSupabaseConfigured()) {
    return null;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getAppConfig();
  const url = config.supabase?.url;
  const anonKey = config.supabase?.anonKey;

  if (!url || !anonKey) {
    return null;
  }

  try {
    supabaseInstance = createClient<Database>(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    return supabaseInstance;
  } catch (error) {
    console.error("[SupabaseClient] Failed to initialize Supabase client:", error);
    return null;
  }
}
