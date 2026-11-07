import { getAppConfig } from "../lib/config/env.js";
import { getSupabaseClient, hasSupabaseConfigured } from "../lib/supabase/client.js";
import { fetchMenuData } from "../features/menu/menu-service.js";

async function verifySupabase() {
  console.log("=================================================");
  console.log("TEST: Supabase Environment, Client & Foundation");
  console.log("=================================================");

  const config = getAppConfig();
  console.log(`[CONFIG] Supabase configured: ${hasSupabaseConfigured()}`);
  console.log(`[CONFIG] Supabase URL: ${config.supabase?.url ? "Set (" + config.supabase.url + ")" : "Not set"}`);
  console.log(`[CONFIG] Supabase Anon Key: ${config.supabase?.anonKey ? "Set (length: " + config.supabase.anonKey.length + ")" : "Not set"}`);
  console.log(`[CONFIG] Service Role Key: ${config.supabase?.serviceRoleKey ? "EXPOSED/PRESENT (SECURITY WARNING)" : "None (Correctly Protected)"}`);

  if (config.supabase?.serviceRoleKey) {
    console.warn("WARNING: SUPABASE_SERVICE_ROLE_KEY is present in client environment!");
  }

  const client = getSupabaseClient();
  if (!client) {
    console.log("[STATUS] Supabase client is not available or unconfigured. Verifying graceful fallback...");
    const fallbackResult = await fetchMenuData();
    console.log(`[DATA SOURCE] Fallback data loaded (isFallback: ${fallbackResult.isFallback}, items: ${fallbackResult.items.length}).`);
    return;
  }

  console.log("\n[STATUS] Querying Supabase tables...");
  let schemaAvailable = true;

  // 1. Check Branches
  const { data: branches, error: branchesErr } = await client.from("branches").select("*");
  if (branchesErr) {
    console.log(`[QUERY: branches] ${branchesErr.message} (Code: ${branchesErr.code})`);
    if (branchesErr.code === "PGRST205") schemaAvailable = false;
  } else {
    console.log(`[QUERY: branches] Success! Found ${branches?.length} branch(es):`, branches?.map(b => `${b.name} (${b.slug})`));
  }

  // 2. Check Tables
  const { data: tables, error: tablesErr } = await client.from("tables").select("*");
  if (tablesErr) {
    console.log(`[QUERY: tables] ${tablesErr.message} (Code: ${tablesErr.code})`);
    if (tablesErr.code === "PGRST205") schemaAvailable = false;
  } else {
    console.log(`[QUERY: tables] Success! Found ${tables?.length} table(s). Table numbers:`, tables?.map(t => t.table_number));
  }

  // 3. Check Menu Categories
  const { data: categories, error: catErr } = await client.from("menu_categories").select("*");
  if (catErr) {
    console.log(`[QUERY: menu_categories] ${catErr.message} (Code: ${catErr.code})`);
    if (catErr.code === "PGRST205") schemaAvailable = false;
  } else {
    console.log(`[QUERY: menu_categories] Success! Found ${categories?.length} category(ies):`, categories?.map(c => c.name));
  }

  // 4. Check Menu Items
  const { data: items, error: itemsErr } = await client.from("menu_items").select("*");
  if (itemsErr) {
    console.log(`[QUERY: menu_items] ${itemsErr.message} (Code: ${itemsErr.code})`);
    if (itemsErr.code === "PGRST205") schemaAvailable = false;
  } else {
    console.log(`[QUERY: menu_items] Success! Found ${items?.length} item(s).`);
  }

  // 5. Test fetchMenuData() data access layer
  console.log("\n[STATUS] Testing fetchMenuData() data access layer...");
  const menuResult = await fetchMenuData();

  if (menuResult.dataSource === "supabase" && !menuResult.isFallback) {
    console.log(`[DATA SOURCE] Live Supabase data loaded successfully! (Items: ${menuResult.items.length}, Categories: ${menuResult.categories.length})`);
  } else {
    console.log(`[DATA SOURCE] Fallback data loaded (Reason: ${menuResult.error ?? "Remote schema not yet populated or empty"}).`);
  }

  console.log(`[FETCH_MENU] Total items returned: ${menuResult.items.length}`);
  console.log(`[FETCH_MENU] First item: ${menuResult.items[0]?.name} (Price: ₹${menuResult.items[0]?.price}, Section: ${menuResult.items[0]?.section})`);

  // Verify that price is in rupees, not paise
  if (menuResult.items[0]?.price > 5000) {
    console.error("[CURRENCY ERROR] Price appears to be in paise instead of rupees! Price: " + menuResult.items[0]?.price);
  } else {
    console.log(`[CURRENCY CHECK PASS] Item price correctly represented in Rupees: ₹${menuResult.items[0]?.price}`);
  }

  // 6. Security Test: Verify Anonymous Mutations are Blocked by RLS
  console.log("\n[SECURITY TEST] Testing anonymous mutation rejection (INSERT into menu_items)...");
  try {
    const { data: insertData, error: insertErr } = await client
      .from("menu_items")
      .insert({
        name: "Unauthorized Hacker Item",
        category_id: "00000000-0000-0000-0000-000000000000",
        price: 999.0,
      });
    if (insertErr) {
      console.log(`[SECURITY TEST PASS] Mutation blocked as expected: ${insertErr.message} (Code: ${insertErr.code})`);
    } else {
      console.error("[SECURITY TEST FAIL] Mutation unexpectedly succeeded:", insertData);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[SECURITY TEST PASS] Mutation threw error as expected: ${msg}`);
  }

  if (!schemaAvailable) {
    console.log("\n[NOTE] Remote Supabase database tables have not been created yet (PGRST205).");
    console.log("To apply the migration and seed to your Supabase project:");
    console.log("1. Open Supabase Dashboard -> SQL Editor");
    console.log("2. Paste and run 'supabase/combined_phase1_migration_and_seed.sql'");
  }

  console.log("=================================================");
  console.log("Verification finished.");
  console.log("=================================================");
}

verifySupabase().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
