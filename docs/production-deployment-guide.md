# Courista — Production Deployment Guide
**Cafe:** Ember & Oak  
**Architecture:** Next.js 16 + React 19 + Convex Backend + Convex Auth + Cloudflare R2  
**Target Hosting:** Vercel (Frontend/Edge) + Convex Cloud (Backend/Database) + Cloudflare R2 (Object Storage)

---

## 1. Overview & Architecture Prerequisites

Courista is a single-cafe digital QR dining and ordering application designed for Ember & Oak (6 physical dining tables). The system operates with:
- **Next.js 16 (App Router) & React 19:** Hosted on Vercel or any standard Node.js/Edge hosting platform.
- **Convex:** Authoritative real-time application database, document store, reactive subscription engine, and scheduled/HTTP actions.
- **Convex Auth (`@convex-dev/auth`):** Password-based staff/admin authentication with cryptographic RS256 JWT tokens.
- **Cloudflare R2:** High-performance, zero-egress-fee S3-compatible image hosting for high-resolution menu photography.

### Accounts & Services Required
1. **Convex Account:** [https://convex.dev](https://convex.dev) (Team/Project created for Courista).
2. **Cloudflare Account:** [https://dash.cloudflare.com](https://dash.cloudflare.com) (R2 bucket enabled).
3. **Vercel Account:** [https://vercel.com](https://vercel.com) (Next.js deployment integration).
4. **Custom Domain (Optional but Recommended):** Configured in Vercel DNS and Cloudflare R2 custom domain.

---

## 2. Environment Variables Specification

The application requires three groups of environment variables. Maintain strict separation between public variables (`NEXT_PUBLIC_*`) and privileged server secrets.

### Production Environment Variables Table

| Variable Name | Scope | Description | Example / Target Value |
|---|---|---|---|
| `CONVEX_DEPLOYMENT` | Server / Build | Convex production deployment identifier | `prod:courista-prod-123` |
| `NEXT_PUBLIC_CONVEX_URL` | Browser & Server | Public WebSocket & query endpoint | `https://courista-prod-123.convex.cloud` |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Browser & Server | Public HTTP action endpoint | `https://courista-prod-123.convex.site` |
| `CONVEX_SERVER_SECRET` | Server-Only (Secret) | High-entropy shared secret for Next.js -> Convex HTTP actions | 32+ byte cryptographic random hex string |
| `R2_ACCOUNT_ID` | Server-Only | Cloudflare Account ID | `a1b2c3d4e5f6...` |
| `R2_BUCKET_NAME` | Server-Only | Name of the R2 bucket | `cafeqr-prod` |
| `R2_ACCESS_KEY_ID` | Server-Only | R2 S3-compatible API Token ID | `1a2b3c4d5e...` |
| `R2_SECRET_ACCESS_KEY` | Server-Only (Secret) | R2 S3-compatible API Secret Key | `9f8e7d6c5b4a...` |
| `R2_PUBLIC_URL` | Browser & Server | Public CDN URL or custom domain for images | `https://assets.emberandoak.com` or `https://pub-xxx.r2.dev` |
| `NEXT_PUBLIC_APP_URL` | Browser & Server | Canonical public domain of the application | `https://order.emberandoak.com` |

> [!CAUTION]
> Never set `CONVEX_SERVER_SECRET`, `R2_ACCESS_KEY_ID`, or `R2_SECRET_ACCESS_KEY` with a `NEXT_PUBLIC_` prefix. Doing so exposes secrets in client JavaScript bundles.

---

## 3. Step-by-Step Convex Production Backend Setup

### Step 3.1: Initialize Production Deployment
1. Log in to the Convex CLI from an authorized environment:
   ```bash
   npx convex login
   ```
2. Deploy the current schema and functions to Convex production:
   ```bash
   npx convex deploy
   ```
   Convex will provision or link your production deployment (e.g. `prod:courista-prod-123`).

### Step 3.2: Configure Production Environment Variables on Convex
Open the Convex Cloud Dashboard (or use CLI with `--prod`):
1. **Set `SITE_URL`:** Must match your production web domain:
   ```bash
   npx convex env set SITE_URL "https://order.emberandoak.com" --prod
   ```
2. **Generate Auth Keys (`JWT_PRIVATE_KEY` and `JWKS`):**
   Run the Auth keypair generator against the production deployment:
   ```bash
   npx @convex-dev/auth --prod
   ```
   Verify that `JWT_PRIVATE_KEY` and `JWKS` are registered in the production deployment settings.
3. **Set `CONVEX_SERVER_SECRET`:**
   Generate a 32-byte cryptographic secret:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Register it on Convex:
   ```bash
   npx convex env set CONVEX_SERVER_SECRET "<YOUR_GENERATED_SECRET>" --prod
   ```
   *(Ensure this exact secret is also added to Vercel environment variables).*

---

## 4. Cloudflare R2 Production Configuration

### Step 4.1: Create Bucket
1. Navigate to **Cloudflare Dashboard -> R2 -> Create Bucket**.
2. Name the bucket (e.g. `cafeqr-prod`).
3. Set location hint to closest region to your cafe (e.g. `APAC` or `WNAM`).

### Step 4.2: Enable Public Access or Custom Domain
1. In the bucket settings, navigate to **Settings -> Public Access**.
2. Either enable **R2.dev subdomain** or attach a **Custom Domain** (e.g. `assets.emberandoak.com`).
3. Set CORS policy on the bucket to allow `GET`, `HEAD` from `https://order.emberandoak.com`.

### Step 4.3: Generate API Tokens
1. Go to **R2 -> Manage R2 API Tokens -> Create API Token**.
2. Permissions: **Object Read & Write**.
3. Bucket scoping: Specific bucket (`cafeqr-prod`).
4. Copy the `Access Key ID` and `Secret Access Key`.

---

## 5. Next.js Frontend Deployment on Vercel

### Step 5.1: Connect Repository
1. In Vercel, click **Add New... -> Project**.
2. Import the `CafeQRApp` repository from GitHub.
3. Framework Preset: **Next.js**.
4. Root Directory: `./`.

### Step 5.2: Configure Build Settings
- **Build Command:** `npx next build --webpack` (or default `next build`)
- **Output Directory:** Default (`.next`)
- **Install Command:** `pnpm install` or `npm install`
- **Node.js Version:** `22.x` (or `>=20.x`)

### Step 5.3: Set Vercel Production Environment Variables
In the project settings, add all production variables listed in Section 2:
- `CONVEX_DEPLOYMENT` = `prod:courista-prod-123`
- `NEXT_PUBLIC_CONVEX_URL` = `https://courista-prod-123.convex.cloud`
- `NEXT_PUBLIC_CONVEX_SITE_URL` = `https://courista-prod-123.convex.site`
- `CONVEX_SERVER_SECRET` = `<YOUR_GENERATED_SECRET>`
- `R2_ACCOUNT_ID` = `<CLOUDFLARE_ACCOUNT_ID>`
- `R2_BUCKET_NAME` = `cafeqr-prod`
- `R2_ACCESS_KEY_ID` = `<R2_ACCESS_KEY_ID>`
- `R2_SECRET_ACCESS_KEY` = `<R2_SECRET_ACCESS_KEY>`
- `R2_PUBLIC_URL` = `https://assets.emberandoak.com`
- `NEXT_PUBLIC_APP_URL` = `https://order.emberandoak.com`

### Step 5.4: Deploy
Click **Deploy**. Monitor build logs to ensure TypeScript, bundling, and route generation complete with zero errors.

---

## 6. Initial Seed & Admin Account Setup

### Step 6.1: Seed Physical Tables (1–6)
On the production Convex deployment, physical dining tables 1 through 6 must be seeded.
In Convex dashboard functions:
1. Run `test_helpers:seedAllTables` (or initial seed mutation) to insert tables 1 through 6 with initial active status and generated SHA-256 QR token hashes.

### Step 6.2: Create Initial Administrator Account
1. Open Convex Dashboard -> Data -> `users` table or run initial admin creation:
2. Register an administrator account via Convex Auth:
   ```bash
   node -e "/* script to create initial admin */"
   ```
   Or use the staff signup flow with `role: "admin"`, `isActive: true`.
3. Verify that the user record has `role: "admin"` and `isActive: true`.
4. Log in at `https://order.emberandoak.com/admin/login` to confirm access.

### Step 6.3: Create Kitchen Staff Account
1. Create a staff user with `role: "kitchen_staff"`, `isActive: true`.
2. Verify login at `https://order.emberandoak.com/staff/login`.
3. Confirm that kitchen staff cannot access `/admin/*` and administrators can access `/admin/*` and `/kitchen`.

---

## 7. Generating & Printing Production QR Codes

1. Log in to the Admin Dashboard at `https://order.emberandoak.com/admin`.
2. Navigate to **Dining Tables & QR Tokens** (`/admin/tables`).
3. For each table (Tables 1 through 6):
   - Click **Regenerate QR Token**.
   - A 32-byte cryptographic hex token is generated client-side; its SHA-256 hash is committed to Convex.
   - The **Branded QR Stand Modal** opens with high-resolution vector QR encoding:
     `https://order.emberandoak.com/qr?table=table-N&token=<RAW_TOKEN>`
   - Export / print the branded acrylic stand cards with Ember & Oak typography and gold styling.
   - Once printed and placed on physical tables, previous QR codes are invalid.

---

## 8. Post-Deployment Verification Checklist

Execute the complete end-to-end verification plan:

| Workflow | Verification Step | Expected Behavior |
|---|---|---|
| **Customer QR Scan** | Scan Table 1 QR with smartphone camera | Redirects to `/table/table-1`; sets `cafe_customer_session` and capability cookies; URL token stripped |
| **Menu Browsing** | Browse categories & item descriptions | Public menu renders active items with correct INR prices; images load from Cloudflare R2 |
| **Cart & Ordering** | Add items and click "Place Order" | Order created (#T1-XXXX); appears instantly in customer tracker |
| **Kitchen Realtime** | Observe Kitchen Dashboard (`/kitchen`) | Chime sounds ("New order Table 1"); ticket appears in New Orders queue |
| **Order Progression** | Staff clicks "Start Preparing" then "Delivered" | Status updates in real-time on kitchen and customer smartphone screen |
| **Customer Service** | Diner clicks "Call Staff" or "Request Water" | Kitchen voice alert plays; request appears in active service banner |
| **Running Bill** | View bill in customer modal | Shows delivered items with exact integer paise total; pending items shown as unbilled |
| **Staff Settlement** | Staff opens Table Sessions panel, selects UPI, clicks "Settle & Close" | Bill is settled; orders marked PAID; customer session revoked with thank-you screen |
| **Subsequent Guests** | Rescan Table 1 QR | Clean fresh session initialized with ₹0 balance; past party cannot order |

