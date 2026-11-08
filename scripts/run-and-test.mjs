import { spawn } from "child_process";
import http from "http";
import puppeteer from "puppeteer-core";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      http.get(url, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      }).on("error", () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error("Timeout waiting for server: " + url));
        } else {
          setTimeout(check, 500);
        }
      });
    }
    check();
  });
}

async function main() {
  console.log("Spawning next start on port 3000...");
  const server = spawn("cmd.exe", ["/c", "corepack pnpm next start -p 3000"], {
    stdio: "inherit",
    detached: false,
  });

  try {
    await waitForServer("http://localhost:3000/staff/login");
    console.log("Next.js server is up and responding at http://localhost:3000/staff/login");

    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();

      console.log("1. Navigating to login page...");
      await page.goto("http://localhost:3000/staff/login", { waitUntil: "networkidle2" });

      await page.waitForSelector('input[type="email"]', { timeout: 10000 });
      console.log("2. Typing credentials...");
      await page.type('input[type="email"]', "kitchen@courista.cafe");
      await page.type('input[type="password"]', "Kitchen@EmberOak2026!");

      console.log("3. Submitting credentials...");
      await page.click('button[type="submit"]');

      // Wait until on /staff
      await page.waitForFunction(() => window.location.pathname === "/staff", { timeout: 10000 });
      console.log("-> Successfully navigated to /staff!");

      // Wait 3 seconds on /staff to confirm stability
      await new Promise((r) => setTimeout(r, 3000));
      console.log("-> Still on URL after 3s:", page.url());

      // 4. Test page reload on /staff
      console.log("4. Testing hard browser reload on /staff...");
      await page.reload({ waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 3000));
      console.log("-> URL after reload:", page.url());
      if (page.url().includes("/staff/login")) {
        throw new Error("Reload kicked user out to /staff/login!");
      }
      console.log("-> Page reload successfully stayed on /staff!");

      // 5. Test navigating back to /staff/login while logged in
      console.log("5. Testing navigation to /staff/login while already logged in...");
      await page.goto("http://localhost:3000/staff/login", { waitUntil: "networkidle2" });
      await new Promise((r) => setTimeout(r, 3000));
      console.log("-> URL after visiting /staff/login:", page.url());
      if (!page.url().includes("/staff")) {
        throw new Error("Did not redirect authenticated user to /staff!");
      }
      console.log("-> Successfully bounced back to /staff!");

      console.log("ALL AUTH & DASHBOARD TESTS PASSED!");
    } finally {
      await browser.close();
    }
  } finally {
    console.log("Killing Next.js server...");
    server.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
