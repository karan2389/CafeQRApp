"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Coffee, Lock, Mail, AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";

function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute error message from URL query params, role state, or local state
  const urlParam = searchParams.get("error");
  const urlParamError =
    urlParam === "forbidden"
      ? "Access denied: You do not have administrator permissions."
      : urlParam === "unauthorized"
      ? "Please sign in to access the administrator portal."
      : urlParam === "session_expired"
      ? "Your session has expired. Please sign in again."
      : null;

  const roleError =
    isAuthenticated && viewer !== undefined
      ? viewer === null
        ? "Account is inactive or has no assigned role. Contact management."
        : viewer.role !== "admin"
        ? viewer.role === "kitchen_staff"
          ? "Access denied: Kitchen staff accounts cannot access the administrator portal."
          : "Access denied: You do not have administrator permissions."
        : null
      : null;

  const displayError = error || roleError || urlParamError;

  // If already authenticated with admin permissions on mount, redirect to admin dashboard
  useEffect(() => {
    if (isAuthenticated && viewer) {
      if (viewer.role === "admin") {
        const rawRedirect = searchParams.get("redirectTo") || "/admin";
        const redirectTo =
          rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
            ? rawRedirect
            : "/admin";
        router.replace(redirectTo);
      } else if (viewer.role === "kitchen_staff") {
        void signOut();
      }
    }
  }, [isAuthenticated, viewer, router, signOut, searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const result = await signIn("password", {
        email: email.trim().toLowerCase(),
        password,
        flow: "signIn",
      });

      if (result && typeof result === "object" && "signingIn" in result && !result.signingIn) {
        setError("Invalid email or password. Please verify your credentials.");
        setLoading(false);
        return;
      }

      // Hard redirect immediately upon successful token generation:
      // Clears cached null viewer from unauthenticated state and mounts /admin fresh
      const rawRedirect = searchParams.get("redirectTo") || "/admin";
      const redirectTo =
        rawRedirect.startsWith("/") && !rawRedirect.startsWith("//") && !rawRedirect.includes(":")
          ? rawRedirect
          : "/admin";

      window.location.href = redirectTo;
    } catch (err: unknown) {
      console.error("[AdminLogin] Authentication error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Could not find user") ||
        msg.includes("Invalid password") ||
        msg.includes("PasswordInvalid") ||
        msg.includes("Account does not exist") ||
        msg.includes("InvalidAccountId") ||
        msg.includes("Invalid credentials") ||
        msg.includes("InvalidSecret")
      ) {
        setError("Invalid email or password. Please check your credentials.");
      } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("failed to fetch")) {
        setError("Network error: Unable to connect to Convex backend. Please check your connection.");
      } else {
        setError(msg || "Sign in failed. Please check your credentials or contact management.");
      }
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

        {displayError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl flex items-start gap-3 text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-400" />
            <span>{displayError}</span>
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
            className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold py-2.5 rounded-xl transition-all shadow-md hover:shadow-amber-500/25 flex items-center justify-center gap-2 mt-2 cursor-pointer"
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

        <div className="pt-4 border-t border-stone-800/80 text-center space-y-2">
          <p className="text-xs text-stone-400">
            Default admin credentials: <span className="text-amber-400 font-mono">admin@courista.cafe</span> or <span className="text-amber-400 font-mono">admin@emberandoak.com</span>
          </p>
          <p className="text-xs text-stone-500">
            Courista Cafe Operating System · Ember & Oak
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-stone-950 px-4 text-stone-100">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
