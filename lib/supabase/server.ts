import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAppConfig } from "@/lib/config/env";
import type { Database } from "@/types/database";

/**
 * Creates an authenticated Supabase server client for Server Components,
 * Server Actions, and Route Handlers using cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const config = getAppConfig();
  const url = config.supabase?.url;
  const anonKey = config.supabase?.anonKey;

  if (!url || !anonKey) {
    throw new Error("[SupabaseServer] Supabase URL or Anon Key is missing in environment.");
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options as CookieOptions);
          });
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing user sessions.
        }
      },
    },
  });
}
