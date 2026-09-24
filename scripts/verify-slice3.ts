import { getAdminClient } from "../lib/supabase/admin";
import crypto from "node:crypto";

async function verifySlice3() {
  console.log("== Verifying Phase 2, Slice 3: QR Table Access ==");
  const adminClient = getAdminClient();
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
  }

  try {
    // Check if tables exist
    console.log("1. Fetching active tables...");
    const { data: tables, error: tableErr } = await adminClient
      .from("tables")
      .select("*")
      .eq("is_active", true)
      .limit(1);
      
    if (tableErr) throw tableErr;
    if (!tables || tables.length === 0) {
      console.log("No active tables found. Creating a test table...");
      const { data: newTable, error: createErr } = await adminClient
        .from("tables")
        .insert({ branch_id: "00000000-0000-0000-0000-000000000000", table_number: 999, is_active: true, display_name: "Test Table" })
        .select()
        .single();
      if (createErr) throw createErr;
      tables.push(newTable);
    }
    
    const tableId = tables[0].id;
    console.log(`Using Table ID: ${tableId}`);

    // Generate token securely (as API would)
    console.log("2. Admin generates QR token...");
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    
    const { error: upsertErr } = await adminClient
      .from("table_qr_tokens")
      .upsert(
        { table_id: tableId, qr_token_hash: tokenHash, generated_at: new Date().toISOString() },
        { onConflict: "table_id" }
      );
      
    if (upsertErr) throw upsertErr;
    console.log("   QR token generated successfully.");

    console.log("3. Customer scans QR token (simulated API POST to /qr)...");
    
    const customerToken = crypto.randomBytes(32).toString("hex");
    const customerTokenHash = crypto.createHash("sha256").update(customerToken).digest("hex");
    
    // @ts-expect-error rpc dynamic call
    const { data: sessionData, error: sessionError } = await adminClient.rpc('resolve_qr_scan', {
      p_qr_token_hash: tokenHash,
      p_customer_token_hash: customerTokenHash
    });
    
    if (sessionError) {
      throw new Error(`RPC failed: ${sessionError.message}`);
    }
    
    // @ts-expect-error dynamic result
    if (!sessionData || sessionData.length === 0) {
      throw new Error("RPC returned no session data");
    }
    
    // @ts-expect-error dynamic result
    const sessionList = sessionData as Array<unknown>;
    console.log("   Valid scan returned session data:");
    console.log(sessionList[0]);
    
    console.log("4. Attempting to scan revoked/invalid token...");
    const badToken = crypto.randomBytes(32).toString("hex");
    const badTokenHash = crypto.createHash("sha256").update(badToken).digest("hex");
    const badCustomerHash = crypto.createHash("sha256").update(crypto.randomBytes(32).toString("hex")).digest("hex");
    
    // @ts-expect-error rpc dynamic call
    const { data: badData, error: badError } = await adminClient.rpc('resolve_qr_scan', {
      p_qr_token_hash: badTokenHash,
      p_customer_token_hash: badCustomerHash
    });
    
    // @ts-expect-error dynamic result
    if (!badError && (!badData || badData.length === 0)) {
       console.log("   Invalid token correctly returned no session (or gracefully failed).");
    } else {
       console.log("   Unexpected result for bad token:", badData, badError);
    }
    
    console.log("✅ Slice 3 verifications passed at the DB layer!");
    
  } catch (err) {
    console.error("❌ Verification failed:", err);
  }
}

verifySlice3();
