"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Utensils, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export default function StaffLoginPage() {
  const router = useRouter();
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const err = searchParams.get("error");
      if (err === "forbidden") {
        return "Access denied: Account is not authorized for kitchen staff access.";
      }
      if (err === "unauthorized") {
        return "Please sign in to access the kitchen dashboard.";
      }
      if (err === "session_expired") {
        return "Your session has expired. Please sign in again.";
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  // If already authenticated with kitchen permissions, redirect to dashboard
  useEffect(() => {
    if (isAuthenticated && viewer) {
      if (viewer.role === "kitchen_staff" || viewer.role === "admin") {
        const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const rawRedirect = searchParams?.get("redirectTo") || "/staff";
        const redirectTo =
          rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
            ? rawRedirect
            : "/staff";
        router.replace(redirectTo);
      }
    }
  }, [isAuthenticated, viewer, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signIn",
      });

      // Authentication state will update reactively; redirect to staff route
      const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const rawRedirect = searchParams?.get("redirectTo") || "/staff";
      const redirectTo =
        rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
          ? rawRedirect
          : "/staff";

      router.replace(redirectTo);
    } catch (err: unknown) {
      console.error("[StaffLogin] Authentication error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Could not find user") ||
        msg.includes("Invalid password") ||
        msg.includes("PasswordInvalid") ||
        msg.includes("Account does not exist")
      ) {
        setError("Invalid email or password.");
      } else {
        setError("Sign in failed. Please check your credentials or contact management.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
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
          <h1 className="text-3xl font-extrabold tracking-tight text-white font-display">
            Kitchen Dashboard
          </h1>
          <p className="text-stone-400 text-sm">
            Sign in with authorized staff credentials to manage line orders.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-red-950/50 border border-red-800/80 text-red-200 text-sm flex items-start space-x-3 backdrop-blur-sm animate-in fade-in slide-in-from-top-1 duration-200"
          >
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium leading-relaxed">{error}</div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2"
              >
                Staff Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                  <Mail className="h-5 w-5" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="chef@courista.cafe"
                  className="w-full pl-11 pr-4 py-3 bg-stone-950/60 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm font-medium"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-400 mb-2"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                  <Lock className="h-5 w-5" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-stone-950/60 border border-stone-800 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500 transition-all text-sm font-medium"
                />
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full py-6 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-stone-950 font-bold rounded-xl shadow-lg shadow-amber-600/20 transition-all flex items-center justify-center space-x-2 text-base disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Verifying credentials…</span>
              </>
            ) : (
              <>
                <span>Access Dashboard</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t border-stone-800/80 text-center">
          <p className="text-xs text-stone-500 leading-relaxed">
            Authorized dining floor & kitchen terminal for Courista. Access is audited and monitored.
          </p>
        </div>
      </div>
    </div>
  );
}
