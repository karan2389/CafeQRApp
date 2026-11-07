"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Coffee, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

export default function AdminLoginPage() {
  const router = useRouter();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const err = searchParams.get("error");
      if (err === "forbidden") {
        return "Access denied: You do not have administrator permissions.";
      }
      if (err === "unauthorized") {
        return "Please sign in to access the administrator portal.";
      }
      if (err === "session_expired") {
        return "Your session has expired. Please sign in again.";
      }
    }
    return null;
  });
  const [loading, setLoading] = useState(false);

  // If already authenticated with admin permissions, redirect to admin dashboard
  useEffect(() => {
    if (isAuthenticated && viewer) {
      if (viewer.role === "admin") {
        const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
        const rawRedirect = searchParams?.get("redirectTo") || "/admin";
        const redirectTo =
          rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
            ? rawRedirect
            : "/admin";
        router.replace(redirectTo);
      } else if (viewer.role === "kitchen_staff") {
        void signOut().then(() => {
          router.replace("/admin/login?error=forbidden");
        });
      }
    }
  }, [isAuthenticated, viewer, router, signOut]);

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

      // Authentication state will update reactively; effect will redirect or verify role
      const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const rawRedirect = searchParams?.get("redirectTo") || "/admin";
      const redirectTo =
        rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
          ? rawRedirect
          : "/admin";

      router.replace(redirectTo);
    } catch (err: unknown) {
      console.error("[AdminLogin] Authentication error:", err);
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
            <Coffee className="w-8 h-8 stroke-[2.5]" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Ember & Oak</h1>
          <p className="text-stone-400 text-sm">Manager & Kitchen Administration Portal</p>
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
              Admin Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-stone-500">
                <Mail className="w-4 h-4" />
              </div>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@courista.cafe"
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
                <span>Sign In as Administrator</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </form>

        <div className="pt-4 border-t border-stone-800/80 text-center">
          <p className="text-xs text-stone-500">
            Courista Cafe Operating System · Ember & Oak
          </p>
        </div>
      </div>
    </div>
  );
}
