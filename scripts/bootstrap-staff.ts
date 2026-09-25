import { getAdminClient } from "../lib/supabase/admin";
import { getAppConfig } from "../lib/config/env";

async function main() {
  const email = process.argv[2] || process.env.STAFF_INITIAL_EMAIL || "kitchen@emberandoak.com";
  const password = process.argv[3] || process.env.STAFF_INITIAL_PASSWORD || "Kitchen@EmberOak2026!";
  const fullName = process.argv[4] || "Kitchen Staff";

  console.log("=================================================");
  console.log("Cafe QR Ordering - Kitchen Staff Bootstrap Utility");
  console.log("=================================================");
  console.log(`Target Email: ${email}`);

  const config = getAppConfig();
  if (!config.supabase?.url || !config.supabase?.serviceRoleKey) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required in .env");
    process.exit(1);
  }

  const supabase = getAdminClient();

  // 1. Check if user already exists in auth.users
  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error("❌ Failed to query auth.users:", listError.message);
    process.exit(1);
  }

  let authUserId: string | undefined = usersData.users.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  )?.id;

  if (!authUserId) {
    console.log("Creating new user in Supabase Auth...");
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: "kitchen_staff" },
    });

    if (createError || !newUser.user) {
      console.error("❌ Failed to create auth user:", createError?.message);
      process.exit(1);
    }

    authUserId = newUser.user.id;
    console.log(`✓ Created auth user with ID: ${authUserId}`);
  } else {
    console.log(`✓ Auth user exists with ID: ${authUserId}`);
    // Update password if provided
    await supabase.auth.admin.updateUserById(authUserId, { password });
    console.log("✓ Updated auth user password.");
  }

  // 2. Upsert into public.staff_users
  const { data: staffRecord, error: upsertError } = await supabase
    .from("staff_users")
    .upsert(
      {
        id: authUserId,
        email,
        full_name: fullName,
        role: "kitchen_staff",
        is_active: true,
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (upsertError) {
    console.error("❌ Failed to upsert public.staff_users record:", upsertError.message);
    process.exit(1);
  }

  console.log("✓ Successfully registered in public.staff_users:");
  console.log(JSON.stringify(staffRecord, null, 2));
  console.log("\n✅ Kitchen staff account ready for login at /staff/login");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
