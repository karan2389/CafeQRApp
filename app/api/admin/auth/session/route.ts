import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/admin";

export async function GET() {
  const result = await verifyAdminSession();

  if (result.status === "unauthenticated") {
    return NextResponse.json(
      { authenticated: false, error: "Unauthorized", message: result.error },
      { status: 401 }
    );
  }

  if (result.status === "forbidden_not_admin") {
    return NextResponse.json(
      { authenticated: false, error: "Forbidden", message: result.error },
      { status: 403 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: result.user.id,
      email: result.user.email,
    },
    admin: {
      id: result.adminUser.id,
      email: result.adminUser.email,
      fullName: result.adminUser.full_name,
      role: result.adminUser.role,
    },
  });
}
