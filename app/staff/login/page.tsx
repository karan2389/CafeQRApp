"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Utensils, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function StaffLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const err = searchParams.get("error");
      if (err === "forbidden") {
        return "Access denied: Account is not authorized for staff access.";
      }
      if (err === "unauthorized") {
        return "Please sign in to access the kitchen dashboard.";
      }
      if (err === "session_expired") {
        return "Your session has expired. Please sign in again.";
      }
      if (err === "config") {
        return "Authentication service configuration issue. Please contact support.";
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [checkingExistingSession, setCheckingExistingSession] = useState(true);

  // Prevent authenticated staff from unnecessarily staying on the login page
  useEffect(() => {
    let mounted = true;

    async function checkExistingAuth() {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          if (mounted) setCheckingExistingSession(false);
          return;
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user && mounted) {
          // Verify staff authorization
          const { data: isStaff } = await supabase.rpc("is_staff");
          let authorized = Boolean(isStaff);
          if (!authorized) {
            const { data: isAdmin } = await supabase.rpc("is_admin");
            authorized = Boolean(isAdmin);
          }

          if (authorized && mounted) {
            const searchParams = new URLSearchParams(window.location.search);
            const rawRedirect = searchParams.get("redirectTo") || "/staff";
            const redirectTo =
              rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
                ? rawRedirect
                : "/staff";
            router.replace(redirectTo);
            return;
          }
        }
      } catch {
        // Silently continue to login form on session lookup error
      } finally {
        if (mounted) {
          setCheckingExistingSession(false);
        }
      }
    }

    checkExistingAuth();

    return () => {
      mounted = false;
    };
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setError("Authentication service is unavailable. Please check system configuration.");
        setLoading(false);
        return;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (authError || !data.user) {
        // Safe error message that does not expose sensitive details
        setError("Invalid email or password.");
        setLoading(false);
        return;
      }

      // Check kitchen staff authorization
      const { data: isStaff } = await supabase.rpc("is_staff");
      let authorized = Boolean(isStaff);

      // Deliberate admin fallback: Allow admins to oversee kitchen
      if (!authorized) {
        const { data: isAdmin } = await supabase.rpc("is_admin");
        authorized = Boolean(isAdmin);
      }

      if (!authorized) {
        setError("Access denied: You do not have staff permissions.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      const searchParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const rawRedirect = searchParams?.get("redirectTo") || "/staff";
      const redirectTo =
        rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
          ? rawRedirect
          : "/staff";

      router.push(redirectTo);
      router.refresh();
    } catch (err: unknown) {
      console.error("[StaffLogin] Authentication error:", err);
      setError("An unexpected error occurred during sign in.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingExistingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-950 px-4 text-stone-100">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-950 px-4 py-12 text-stone-100 selection:bg-amber-500 selection:text-white">
      <div className="max-w-md w-full space-y-8 bg-stone-900/90 p-8 sm:p-10 rounded-3xl border border-stone-800 shadow-2xl backdrop-blur-xl">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 bg-gradient-to-tr from-amber-600 to-amber-400 text-stone-950 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
            <Utensils className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Ember & Oak</h1>
          <p className="text-stone-400 text-sm">Kitchen & Staff Portal</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl flex items-start gap-3 text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
              Staff Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kitchen@emberandoak.com"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-800/80 border border-stone-700/80 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-stone-300">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-stone-800/80 border border-stone-700/80 rounded-xl text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-amber-500/25 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In to Kitchen</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        <div className="text-center pt-2">
          <p className="text-xs text-stone-400">
            Protected area. Authorized kitchen and cafe staff only.
          </p>
        </div>
      </div>
    </div>
  );
}
