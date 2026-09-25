import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppConfig } from "@/lib/config/env";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminRoute = pathname.startsWith("/admin") || pathname.startsWith("/api/admin");
  const isStaffRoute = pathname.startsWith("/staff") || pathname.startsWith("/api/staff");

  // Only run middleware for admin or staff routes
  if (!isAdminRoute && !isStaffRoute) {
    return NextResponse.next();
  }

  // Exempt public login pages and public auth endpoints
  if (
    pathname.startsWith("/admin/login") ||
    pathname.startsWith("/staff/login") ||
    pathname.startsWith("/api/admin/auth") ||
    pathname.startsWith("/api/staff/auth")
  ) {
    return NextResponse.next();
  }

  const config = getAppConfig();
  const url = config.supabase?.url;
  const anonKey = config.supabase?.anonKey;

  // Handle unconfigured Supabase environment
  if (!url || !anonKey) {
    if (config.isProduction) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
      }
      const targetLogin = isAdminRoute ? "/admin/login" : "/staff/login";
      const loginUrl = new URL(targetLogin, request.url);
      loginUrl.searchParams.set("error", "config");
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as CookieOptions)
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Unauthenticated handling
  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const targetLogin = isAdminRoute ? "/admin/login" : "/staff/login";
    const loginUrl = new URL(targetLogin, request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Authorization check for Admin routes
  if (isAdminRoute) {
    const { data: isAdmin, error: adminCheckError } = await supabase.rpc("is_admin");

    if (adminCheckError || !isAdmin) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Admin access required" }, { status: 403 });
      }
      const loginUrl = new URL("/admin/login", request.url);
      loginUrl.searchParams.set("error", "forbidden");
      return NextResponse.redirect(loginUrl);
    }
  }

  // 3. Authorization check for Staff routes
  if (isStaffRoute) {
    // Check if user is staff
    const { data: isStaff } = await supabase.rpc("is_staff");
    let isAuthorizedStaff = Boolean(isStaff);

    // Deliberate admin access: Admins are authorized to view kitchen operations
    if (!isAuthorizedStaff) {
      const { data: isAdmin } = await supabase.rpc("is_admin");
      isAuthorizedStaff = Boolean(isAdmin);
    }

    if (!isAuthorizedStaff) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Forbidden: Staff access required" }, { status: 403 });
      }
      const loginUrl = new URL("/staff/login", request.url);
      loginUrl.searchParams.set("error", "forbidden");
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/admin/:path*",
    "/staff",
    "/staff/:path*",
    "/api/staff/:path*",
  ],
};
