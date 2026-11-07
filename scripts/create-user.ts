import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api.js";

/**
 * CLI utility to create staff and administrator accounts in Convex Auth.
 *
 * Usage:
 *   npx tsx scripts/create-user.ts --email=chef@courista.cafe --password=YourPassword123! --role=kitchen_staff --name="Chef Mario"
 *   npx tsx scripts/create-user.ts --email=admin@courista.cafe --password=YourPassword123! --role=admin --name="General Manager" --prod
 */
async function main() {
  const args = process.argv.slice(2);
  const isProd = args.includes("--prod");

  const getArg = (name: string): string | undefined => {
    const match = args.find((a) => a.startsWith(`--${name}=`));
    return match ? match.split("=")[1] : undefined;
  };

  const email = getArg("email")?.toLowerCase().trim();
  const password = getArg("password");
  const role = getArg("role") as "admin" | "kitchen_staff" | undefined;
  const name = getArg("name") || email?.split("@")[0] || "Staff Member";

  if (!email || !password || !role) {
    console.error("Usage: npx tsx scripts/create-user.ts --email=<email> --password=<password> --role=<admin|kitchen_staff> [--name=<name>] [--prod]");
    console.error("Example: npx tsx scripts/create-user.ts --email=admin@courista.cafe --password=EmberOakAdmin2026! --role=admin --prod");
    process.exit(1);
  }

  if (role !== "admin" && role !== "kitchen_staff") {
    console.error("Error: --role must be either 'admin' or 'kitchen_staff'");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("Error: --password must be at least 8 characters long");
    process.exit(1);
  }

  const devUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://outgoing-perch-487.convex.cloud";
  const prodUrl = "https://small-gopher-755.convex.cloud";
  const targetUrl = isProd ? prodUrl : devUrl;
  const envLabel = isProd ? "PRODUCTION" : "DEVELOPMENT";

  console.log(`Connecting to ${envLabel} Convex deployment at: ${targetUrl}`);
  console.log(`Creating user: ${email} (Role: ${role}, Name: ${name})...`);

  const client = new ConvexHttpClient(targetUrl);

  try {
    const res = (await client.action(api.auth.signIn, {
      provider: "password",
      params: {
        email,
        password,
        name,
        role,
        flow: "signUp",
      },
    })) as { tokens?: { token?: string } };

    if (res?.tokens?.token) {
      client.setAuth(res.tokens.token);
      const viewer = await client.query(api.users.viewer);
      console.log(`\n SUCCESS: User account successfully created!`);
      console.log(`  Environment: ${envLabel}`);
      console.log(`  Email:       ${email}`);
      console.log(`  Name:        ${viewer?.name}`);
      console.log(`  Role:        ${viewer?.role}`);
      console.log(`  User ID:     ${viewer?.id}`);
      console.log(`  Active:      ${viewer?.isActive}`);
    } else {
      console.log(` Account registered without token returned.`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("already exists") || msg.includes("Account already exists")) {
      console.log(`\n NOTE: Account with email "${email}" already exists.`);
      console.log(`Verifying login credentials...`);
      try {
        const loginRes = (await client.action(api.auth.signIn, {
          provider: "password",
          params: {
            email,
            password,
            flow: "signIn",
          },
        })) as { tokens?: { token?: string } };

        if (loginRes?.tokens?.token) {
          client.setAuth(loginRes.tokens.token);
          const viewer = await client.query(api.users.viewer);
          console.log(` SUCCESS: Credentials verified! Account is active.`);
          console.log(`  Role: ${viewer?.role}`);
        }
      } catch {
        console.error(` Login check failed: The account exists, but the provided password does not match.`);
      }
    } else {
      console.error(` Failed to create account:`, msg);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
