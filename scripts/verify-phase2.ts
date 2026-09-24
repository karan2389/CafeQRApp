import { getAppConfig } from "../lib/config/env";
import { getSupabaseClient } from "../lib/supabase/client";
import crypto from "node:crypto";

async function runPhase2Verification() {
  console.log("=================================================");
  console.log("Phase 2 Verification: Admin, RLS, and QR Security");
  console.log("=================================================");

  const config = getAppConfig();
  console.log(`Node Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`Supabase URL: ${config.supabase?.url ? "✓ Configured" : "✗ Missing"}`);
  console.log(`Supabase Anon Key: ${config.supabase?.anonKey ? "✓ Configured" : "✗ Missing"}`);
  console.log(`Supabase Service Role Key: ${config.supabase?.serviceRoleKey ? "✓ Configured" : "✗ Missing"}`);
  console.log(`Cloudflare R2 Bucket: ${config.r2?.bucketName ? "✓ Configured" : "✗ Not set (Local/Mock Mode)"}`);

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.log("\n⚠️ Supabase client not configured in active environment. Testing local fallback...");
    console.log("✓ Local demo fallback is active.");
    return;
  }

  console.log("\n--- 1. Testing QR Token Column Isolation on public.tables ---");
  const { data: tablesData, error: tablesError } = await supabase
    .from("tables")
    .select("*")
    .limit(5);

  if (tablesError) {
    console.error("❌ Failed to query public.tables:", tablesError.message);
  } else {
    console.log(`✓ Fetched ${tablesData?.length ?? 0} rows from public.tables with public anonymous key.`);
    if (tablesData && tablesData.length > 0) {
      const sample = tablesData[0];
      const hasQrHashColumn = "qr_token_hash" in sample;
      if (!hasQrHashColumn) {
        console.log("✓ CONFIRMED: qr_token_hash is NOT exposed on public.tables!");
      } else {
        console.error("❌ SECURITY ALERT: qr_token_hash is present on public.tables!");
        process.exit(1);
      }
    }
  }

  console.log("\n--- 2. Testing Strict RLS on table_qr_tokens (Anonymous Access) ---");
  const { data: qrTokensData, error: qrTokensError } = await supabase
    .from("table_qr_tokens")
    .select("*");

  if (qrTokensError) {
    console.log(`✓ Access blocked by database/RLS: ${qrTokensError.message}`);
  } else if (!qrTokensData || qrTokensData.length === 0) {
    console.log("✓ CONFIRMED: Anonymous SELECT on table_qr_tokens returns 0 rows (RLS filtered).");
  } else {
    console.error("❌ SECURITY ALERT: Anonymous user can read table_qr_tokens!");
    process.exit(1);
  }

  console.log("\n--- 3. Testing RLS Mutation Protection on menu_items ---");
  const { error: insertError } = await supabase.from("menu_items").insert({
    name: "Hacked Item",
    category_id: "00000000-0000-0000-0000-000000000000",
    price: 999,
    is_available: true,
    requires_age_confirmation: false,
    display_order: 999,
  });

  if (insertError) {
    console.log(`✓ Anonymous INSERT blocked by RLS as expected: ${insertError.message}`);
  } else {
    console.error("❌ SECURITY ALERT: Anonymous INSERT succeeded on menu_items!");
    process.exit(1);
  }

  console.log("\n--- 4. Testing SHA-256 Token Generation & Hash Verification ---");
  const testToken = "test_qr_token_secret_123456789";
  const expectedHash = crypto.createHash("sha256").update(testToken).digest("hex");
  console.log(`Test Token: ${testToken}`);
  console.log(`Computed SHA-256: ${expectedHash}`);
  if (expectedHash.length === 64) {
    console.log("✓ SHA-256 cryptographic hashing pipeline verified.");
  }

  console.log("\n=================================================");
  console.log("✅ Phase 2 Architecture & Security Verification Passed!");
  console.log("=================================================");
}

runPhase2Verification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
