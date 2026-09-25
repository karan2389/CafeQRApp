import { NextResponse, type NextRequest } from "next/server";
import { requireAdminApi } from "@/lib/auth/admin";
import { getAdminClient } from "@/lib/supabase/admin";

interface CreateStaffBody {
  email: string;
  password?: string;
  fullName?: string;
  isActive?: boolean;
}

/**
 * GET /api/admin/staff
 * Lists staff users. Restricted to authenticated administrators.
 */
export async function GET() {
  const auth = await requireAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  const adminClient = getAdminClient();
  const { data: staffList, error } = await adminClient
    .from("staff_users")
    .select("id, email, full_name, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[AdminStaffAPI] Failed to fetch staff users:", error);
    return NextResponse.json({ error: "Failed to retrieve staff list" }, { status: 500 });
  }

  return NextResponse.json({ staff: staffList });
}

/**
 * POST /api/admin/staff
 * Provisions a new kitchen staff account. Restricted to authenticated administrators.
 * Creates the auth.users record via service-role admin API and inserts into public.staff_users.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body = (await request.json()) as CreateStaffBody;
    const email = body.email?.trim().toLowerCase();
    const password = body.password?.trim();
    const fullName = body.fullName?.trim() || null;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : true;

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
    }

    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();

    // Check if user already exists in auth.users
    const { data: existingUsers, error: listError } = await adminClient.auth.admin.listUsers();
    if (listError) {
      console.error("[AdminStaffAPI] User check failed:", listError);
      return NextResponse.json({ error: "Failed to verify account uniqueness" }, { status: 500 });
    }

    let authUserId = existingUsers.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase()
    )?.id;

    if (!authUserId) {
      // Create user in Supabase Auth
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName, role: "kitchen_staff" },
      });

      if (createError || !newUser.user) {
        console.error("[AdminStaffAPI] Create auth user failed:", createError);
        return NextResponse.json(
          { error: createError?.message || "Failed to create staff user in auth" },
          { status: 400 }
        );
      }

      authUserId = newUser.user.id;
    } else {
      // User exists in auth.users: update password and metadata
      await adminClient.auth.admin.updateUserById(authUserId, {
        password,
        user_metadata: { full_name: fullName, role: "kitchen_staff" },
      });
    }

    // Upsert into public.staff_users
    const { data: staffRecord, error: staffUpsertError } = await adminClient
      .from("staff_users")
      .upsert(
        {
          id: authUserId,
          email,
          full_name: fullName,
          role: "kitchen_staff",
          is_active: isActive,
        },
        { onConflict: "id" }
      )
      .select("id, email, full_name, role, is_active, created_at, updated_at")
      .single();

    if (staffUpsertError) {
      console.error("[AdminStaffAPI] Upsert staff_users failed:", staffUpsertError);
      return NextResponse.json(
        { error: "Failed to create authorization record" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        message: "Staff account provisioned successfully",
        staff: staffRecord,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    console.error("[AdminStaffAPI] Provisioning exception:", err);
    return NextResponse.json(
      { error: "An unexpected error occurred while creating staff account" },
      { status: 500 }
    );
  }
}
