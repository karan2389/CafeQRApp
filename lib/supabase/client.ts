import { getAppConfig } from "@/lib/config/env";

/**
 * Supabase client placeholder / factory.
 * In the current demo mode, state is synchronized via local storage and BroadcastChannel.
 * When Supabase environment variables are provided, this module serves as the entry point
 * for the Supabase JS client.
 */
export function hasSupabaseConfigured(): boolean {
  const config = getAppConfig();
  return Boolean(config.supabase?.url && config.supabase?.anonKey);
}
