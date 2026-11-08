import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

async function main() {
  const args = process.argv.slice(2);
  const isProd = args.includes("--prod");

  const devUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outgoing-perch-487.convex.cloud";
  const prodUrl = "https://small-gopher-755.convex.cloud";
  const targetUrl = isProd ? prodUrl : devUrl;
  const envLabel = isProd ? "PRODUCTION" : "DEVELOPMENT";

  console.log("==================================================================");
  console.log(`  EMBER & OAK — CONVEX SEED UTILITY (${envLabel})`);
  console.log(`  Connecting to: ${targetUrl}`);
  console.log("==================================================================");

  const client = new ConvexHttpClient(targetUrl);

  // 1. Seed Tables, Cafe Settings, Categories, and Menu Items
  console.log("\n1. Seeding Tables, Settings, Categories, and Demo Menu Items...");
  try {
    const seedResult = await client.mutation(api.seed.seedAll, {});
    console.log("   Seed Result:", seedResult);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("   Failed to seed menu:", msg);
  }

  // 2. Query Public Menu Catalog to verify
  console.log("\n2. Verifying public menu catalog...");
  try {
    const publicMenu = await client.query(api.menu.getPublicMenu, {});
    console.log(`   Categories in catalog: ${publicMenu.length}`);
    let totalItems = 0;
    for (const cat of publicMenu) {
      console.log(`     - [${cat.name}] (${cat.slug}): ${cat.items.length} items`);
      totalItems += cat.items.length;
    }
    console.log(`   Total available items: ${totalItems}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("   Failed to query public menu:", msg);
  }

  // 3. Provision / verify staff and admin accounts
  console.log("\n3. Provisioning staff and admin credentials...");
  const accountsToProvision = [
    {
      email: "kitchen@courista.cafe",
      password: "EmberOakKitchen2026!",
      name: "Kitchen Staff",
      role: "kitchen_staff" as const,
    },
    {
      email: "kitchen@emberandoak.com",
      password: "Kitchen@EmberOak2026!",
      name: "Kitchen Staff (Legacy)",
      role: "kitchen_staff" as const,
    },
    {
      email: "admin@courista.cafe",
      password: "EmberOakAdmin2026!",
      name: "Ember & Oak Admin",
      role: "admin" as const,
    },
    {
      email: "admin@emberandoak.com",
      password: "Admin@EmberOak2026!",
      name: "Ember & Oak Admin (Legacy)",
      role: "admin" as const,
    },
  ];

  for (const acc of accountsToProvision) {
    try {
      const res = (await client.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: acc.email,
          password: acc.password,
          name: acc.name,
          role: acc.role,
          flow: "signUp",
        },
      })) as { tokens?: { token?: string } };

      if (res?.tokens?.token) {
        console.log(`   [CREATED] ${acc.email} (${acc.role})`);
      } else {
        console.log(`   [REGISTERED] ${acc.email} (${acc.role})`);
      }
    } catch {
      // Account likely exists; verify login
      try {
        const loginRes = (await client.action(api.auth.signIn, {
          provider: "password",
          params: {
            email: acc.email,
            password: acc.password,
            flow: "signIn",
          },
        })) as { tokens?: { token?: string } };

        if (loginRes?.tokens?.token) {
          console.log(`   [EXISTS & VERIFIED] ${acc.email} (${acc.role})`);
        } else {
          console.log(`   [EXISTS] ${acc.email}`);
        }
      } catch (loginErr: unknown) {
        const loginMsg = loginErr instanceof Error ? loginErr.message : String(loginErr);
        console.log(`   [EXISTS - PASSWORD MISMATCH] ${acc.email}: ${loginMsg}`);
        console.log(`   Resetting account to synchronize password for: ${acc.email}...`);
        await client.mutation(api.seed.resetUserForPasswordSync, { email: acc.email });
        const retryRes = (await client.action(api.auth.signIn, {
          provider: "password",
          params: {
            email: acc.email,
            password: acc.password,
            name: acc.name,
            role: acc.role,
            flow: "signUp",
          },
        })) as { tokens?: { token?: string } };
        console.log(`   [RESET & RE-PROVISIONED] ${acc.email} with password: ${acc.password} (token: ${Boolean(retryRes?.tokens?.token)})`);
      }
    }
  }

  console.log("\n==================================================================");
  console.log("  SEED COMPLETE!");
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
