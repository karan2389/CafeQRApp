import { NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/auth/staff";

export async function GET() {
  const result = await verifyStaffSession();

  if (result.status === "unauthenticated") {
    return NextResponse.json(
      { authenticated: false, error: "Unauthorized", message: result.error },
      { status: 401 }
    );
  }

  if (result.status === "forbidden_not_staff") {
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
    staff: result.staffUser
      ? {
          id: result.staffUser.id,
          email: result.staffUser.email,
          fullName: result.staffUser.full_name,
          role: result.staffUser.role,
          isActive: result.staffUser.is_active,
        }
      : null,
    role: result.role,
  });
}
