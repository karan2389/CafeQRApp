import { mapDbMenuItemToDomain } from "../features/menu/menu-service.js";
import { menuItems as demoItems } from "../app/lib/demo-data.js";
import { formatINR } from "../lib/format.js";
import type { DbMenuItem } from "../types/database.js";

async function testFallbackAndMapping() {
  console.log("=================================================");
  console.log("TEST: Rupee Currency, Cart Math & Local Fallback");
  console.log("=================================================");

  // 1. Validate demo menu items count and integrity
  console.log(`[CHECK 1] Demo menu items count: ${demoItems.length}`);
  if (demoItems.length !== 10) {
    throw new Error(`Expected 10 demo items, got ${demoItems.length}`);
  }

  // 2. Validate sections
  const mainItems = demoItems.filter((item) => item.section === "MAIN");
  const puffItems = demoItems.filter((item) => item.section === "PUFFS");
  console.log(`[CHECK 2] Main items count: ${mainItems.length} (expected 6)`);
  console.log(`[CHECK 3] Puffs items count: ${puffItems.length} (expected 4)`);
  if (mainItems.length !== 6 || puffItems.length !== 4) {
    throw new Error("Mismatch in section counts");
  }

  // 3. Test DB to Domain item mapping (Rupee pricing)
  const mockDbItem: DbMenuItem = {
    id: "db-uuid-1",
    category_id: "cat-uuid-1",
    name: "Cortado Test",
    description: "Espresso with warm textured milk",
    price: 190.0,
    image_url: "/menu/cortado.svg",
    is_available: true,
    requires_age_confirmation: false,
    display_order: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const domainMain = mapDbMenuItemToDomain(mockDbItem, "Coffee", "coffee");
  console.log(`[CHECK 4] Mapping MAIN item: ${domainMain.name}, price: ₹${domainMain.price}, section: ${domainMain.section}`);
  if (domainMain.section !== "MAIN" || domainMain.price !== 190) {
    throw new Error(`DB to Domain mapping failed for MAIN item: price is ${domainMain.price}, expected 190`);
  }

  const mockDbPuff: DbMenuItem = {
    id: "db-uuid-2",
    category_id: "cat-uuid-2",
    name: "Cool Mint Test",
    description: "Crisp cool profile",
    price: 650.0,
    image_url: "/menu/puffs.svg",
    is_available: true,
    requires_age_confirmation: true,
    display_order: 7,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const domainPuff = mapDbMenuItemToDomain(mockDbPuff, "Puffs", "puffs");
  console.log(`[CHECK 5] Mapping PUFFS item: ${domainPuff.name}, price: ₹${domainPuff.price}, section: ${domainPuff.section}`);
  if (domainPuff.section !== "PUFFS" || domainPuff.price !== 650) {
    throw new Error(`DB to Domain mapping failed for PUFFS item: price is ${domainPuff.price}, expected 650`);
  }

  // 4. Test Cart Calculations in Rupees
  console.log("[CHECK 6] Testing Cart Calculations in Rupees...");
  const qty1 = 2; // 2 x ₹190 = ₹380
  const qty2 = 1; // 1 x ₹650 = ₹650
  const line1 = Math.round(domainMain.price * qty1 * 100) / 100;
  const line2 = Math.round(domainPuff.price * qty2 * 100) / 100;
  const total = Math.round((line1 + line2) * 100) / 100;

  console.log(`  Line 1: ₹${domainMain.price} × ${qty1} = ₹${line1}`);
  console.log(`  Line 2: ₹${domainPuff.price} × ${qty2} = ₹${line2}`);
  console.log(`  Total: ₹${line1} + ₹${line2} = ₹${total}`);

  if (line1 !== 380 || line2 !== 650 || total !== 1030) {
    throw new Error(`Cart math failed: expected line1=380, line2=650, total=1030; got ${line1}, ${line2}, ${total}`);
  }

  // 5. Test Display Formatting
  console.log("[CHECK 7] Testing INR currency formatting...");
  const formatted190 = formatINR(190);
  const formatted650 = formatINR(650);
  const formattedTotal = formatINR(1030);

  console.log(`  formatINR(190) -> '${formatted190}'`);
  console.log(`  formatINR(650) -> '${formatted650}'`);
  console.log(`  formatINR(1030) -> '${formattedTotal}'`);

  if (!formatted190.includes("190") || !formatted650.includes("650") || !formattedTotal.includes("1,030")) {
    throw new Error("Currency formatting does not match expected output");
  }

  console.log("=================================================");
  console.log("All local fallback, cart & rupee tests PASSED!");
  console.log("=================================================");
}

testFallbackAndMapping().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
