# Phase 1: Supabase Database Foundation, SQL Idempotency, and Rupee Pricing

This document details the architecture, database schema, data access layer, local fallback guarantees, security policies, currency model, and validation results for **Phase 1** of the Cafe QR Ordering System (`CafeQRApp`).

---

## 1. Executive Summary & Phase 1 Fixes

Phase 1 establishes the database foundation on Supabase and connects the Next.js frontend to load menu categories and menu items dynamically in a **read-only** manner, with 100% backward compatibility with the existing local demo mode.

### Key Corrections Implemented:
1. **`menu_categories` Unique Constraint**: Added database-level constraint `CONSTRAINT unique_branch_category_slug UNIQUE (branch_id, slug)` with safe pre-deduplication logic.
2. **Truly Idempotent Category Seeding**: Replaced `ON CONFLICT DO NOTHING` with `ON CONFLICT (branch_id, slug) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order, is_active = EXCLUDED.is_active RETURNING id INTO ...`.
3. **Non-Destructive Menu Item Seeding**: Replaced destructive `DELETE FROM public.menu_items` with a unique constraint `CONSTRAINT unique_category_item_name UNIQUE (category_id, name)` and `ON CONFLICT (category_id, name) DO UPDATE`. Existing items are never deleted during seed re-runs.
4. **`updated_at` Trigger**: Added an idempotent PL/pgSQL function and trigger (`set_updated_at_timestamp()`) to automatically maintain `menu_items.updated_at = now()` on updates.
5. **Indian Rupee (₹) Currency Model**: Removed misleading `pricePaise` and division/multiplication by 100 throughout the domain, cart, UI, and test suites. Prices are stored in database `numeric(10, 2)` Rupees, mapped directly to `price: number` in INR, and displayed as `₹190`, `₹650`, etc.
6. **Cart Rupee Calculations**: Cart multiplication (`unitPrice * quantity`) and total summation operate directly on rupee amounts with two-decimal rounding.
7. **Branch-Scoped Queries**: Data access strictly scopes queries to the active branch (`slug = 'ember-and-oak'`), preventing cross-branch data exposure.
8. **Row Level Security (RLS) Review**: Public read-only policies are verified. Inactive tables and categories are hidden from anonymous queries. Menu items are readable if their parent category is active. Public mutations remain blocked.

---

## 2. Currency Representation & Formatting

### 2.1 Rupee-First Model
- **Database Column**: `menu_items.price NUMERIC(10, 2) NOT NULL CHECK (price >= 0)`.
- **Domain Model (`types/menu.ts`)**: `price: number` representing the amount in Indian Rupees (₹).
- **Cart Lines (`types/orders.ts`)**: `unitPrice: number` and `lineTotal: number` in Rupees.
- **Cart Totals**: `cartTotal` is the direct sum of `lineTotal` values in Rupees.

### 2.2 Display Formatting (`lib/format.ts`)
```ts
export function formatINR(rupees: number): string {
  const amount = Number.isFinite(rupees) ? rupees : 0;
  const hasDecimals = amount % 1 !== 0;

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
```
- Whole rupee amounts display without decimals (e.g. `190` -> `₹190`, `650` -> `₹650`, `1030` -> `₹1,030`).
- Fractional amounts automatically display paise (e.g. `190.50` -> `₹190.50`).
- No division by `100` is performed in UI components or formatters.

### 2.3 Payment Boundary Isolation Rule
Future payment provider integrations (e.g., Razorpay, Stripe) that demand the smallest currency unit (paise) must perform that conversion strictly at the API gateway boundary when generating payment intents/orders, never in the customer-facing menu or cart state.

---

## 3. Database Schema & Migration Details

Migration file: [`supabase/migrations/20260922000001_phase1_foundation.sql`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/supabase/migrations/20260922000001_phase1_foundation.sql)
Combined Script: [`supabase/combined_phase1_migration_and_seed.sql`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/supabase/combined_phase1_migration_and_seed.sql)

### 3.1 Tables and Constraints

#### `branches`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL UNIQUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

#### `tables`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE`
- `table_number INTEGER NOT NULL`
- `display_name TEXT`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraint**: `CONSTRAINT unique_branch_table_number UNIQUE (branch_id, table_number)`

#### `menu_categories`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `slug TEXT NOT NULL`
- `display_order INTEGER NOT NULL DEFAULT 0`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraint**: `CONSTRAINT unique_branch_category_slug UNIQUE (branch_id, slug)`
  - *Pre-migration Deduplication*: If duplicate `(branch_id, slug)` rows exist, the migration reassigns any existing `menu_items` to the primary ID and safely purges duplicates before creating the constraint.

#### `menu_items`
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE`
- `name TEXT NOT NULL`
- `description TEXT`
- `price NUMERIC(10, 2) NOT NULL CHECK (price >= 0)`
- `image_url TEXT`
- `is_available BOOLEAN NOT NULL DEFAULT true`
- `requires_age_confirmation BOOLEAN NOT NULL DEFAULT false`
- `display_order INTEGER NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- **Constraint**: `CONSTRAINT unique_category_item_name UNIQUE (category_id, name)`
  - Enables safe upserts without deleting existing items.
- **Trigger**: `trigger_set_menu_items_updated_at` automatically executes `set_updated_at_timestamp()` on update.

### 3.2 Row Level Security (RLS) Review
All four tables enforce RLS:
- **`branches`**: `SELECT` permitted (`USING (true)`).
- **`tables`**: `SELECT` permitted only for active tables (`USING (is_active = true)`). Inactive tables (e.g. Table 5) cannot be read anonymously.
- **`menu_categories`**: `SELECT` permitted only for active categories (`USING (is_active = true)`).
- **`menu_items`**: `SELECT` permitted for items under active categories (`USING (EXISTS (SELECT 1 FROM menu_categories mc WHERE mc.id = menu_items.category_id AND mc.is_active = true))`).
  - *Unavailable Items Policy*: In our cafe ordering workflow, unavailable items (e.g. `Burnt Honey Croissant`, `Classic Gold`) are deliberately returned to the client so that the UI can present an "Unavailable / Sold Out" badge and disable the add-to-cart buttons. If a business requirement later mandates completely hiding sold-out items from public inspection, the RLS policy can be updated to `USING (is_available = true)`.
- **Public Mutations**: Denied. No `INSERT`, `UPDATE`, or `DELETE` policies are granted to the anonymous role.

---

## 4. Development Seed Data

Seed script: [`supabase/seed.sql`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/supabase/seed.sql)

### 4.1 Seed Counts
- **Branches (1)**: `Ember & Oak` (`ember-and-oak`)
- **Tables (6)**: Tables 1, 2, 3, 4, 6 active (`is_active = true`); Table 5 closed (`is_active = false`)
- **Menu Categories (6)**: Coffee, Cold, Breakfast, Bowls, Bakes, Puffs
- **Menu Items (10)**:
  1. Cortado (`₹190.00`, Coffee, Available)
  2. Sea Salt Mocha (`₹260.00`, Coffee, Available)
  3. Citrus Cold Brew (`₹240.00`, Cold, Available)
  4. Forest Toast (`₹320.00`, Breakfast, Available)
  5. Harvest Grain Bowl (`₹360.00`, Bowls, Available)
  6. Burnt Honey Croissant (`₹220.00`, Bakes, Unavailable)
  7. Cool Mint (`₹650.00`, Puffs, `requires_age_confirmation = true`, Available)
  8. Berry Ice (`₹680.00`, Puffs, `requires_age_confirmation = true`, Available)
  9. Citrus Rush (`₹680.00`, Puffs, `requires_age_confirmation = true`, Available)
  10. Classic Gold (`₹720.00`, Puffs, `requires_age_confirmation = true`, Unavailable)

### 4.2 Non-Destructive Upsert Logic
All seeds use deterministic `ON CONFLICT ... DO UPDATE` statements. No `DELETE FROM public.menu_items` is executed, preventing accidental deletion of production records or broken foreign-key references to historical orders.

---

## 5. Live Supabase vs Fallback Verification

### 5.1 Remote Database Verification
The migration and seed script [`supabase/combined_phase1_migration_and_seed.sql`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/supabase/combined_phase1_migration_and_seed.sql) has been applied to the live Supabase project.

Running `pnpm run test:supabase` verifies the live database directly:
```text
=================================================
TEST: Supabase Environment, Client & Foundation
=================================================
[CONFIG] Supabase configured: true
[CONFIG] Supabase URL: Set (https://fzizggwjwekufjhutctc.supabase.co)
[CONFIG] Supabase Anon Key: Set (length: 208)
[CONFIG] Service Role Key: None (Correctly Protected)

[STATUS] Querying Supabase tables...
[QUERY: branches] Success! Found 1 branch(es): [ 'Ember & Oak (ember-and-oak)' ]
[QUERY: tables] Success! Found 5 table(s). Table numbers: [ 1, 2, 3, 4, 6 ]
[QUERY: menu_categories] Success! Found 6 category(ies): [ 'Coffee', 'Cold', 'Breakfast', 'Bowls', 'Bakes', 'Puffs' ]
[QUERY: menu_items] Success! Found 10 item(s).

[STATUS] Testing fetchMenuData() data access layer...
[DATA SOURCE] Live Supabase data loaded successfully! (Items: 10, Categories: 6)
[FETCH_MENU] Total items returned: 10
[FETCH_MENU] First item: Cortado (Price: ₹190, Section: MAIN)
[CURRENCY CHECK PASS] Item price correctly represented in Rupees: ₹190

[SECURITY TEST] Testing anonymous mutation rejection (INSERT into menu_items)...
[SECURITY TEST PASS] Mutation blocked as expected: new row violates row-level security policy for table "menu_items" (Code: 42501)
=================================================
Verification finished.
```
*Note on Active Tables count*: Out of 6 total seeded tables, Table 5 has `is_active = false`. The RLS policy `USING (is_active = true)` correctly hides Table 5 from anonymous queries, returning the 5 active tables (1, 2, 3, 4, 6) as designed.

---

## 6. Validation Results

All checks have been executed and verified locally:

| Validation Step | Command | Exit Code | Result Summary |
|---|---|---|---|
| **TypeScript Typecheck** | `pnpm typecheck` | `0` | Zero type errors across all files (`tsc --noEmit`). |
| **ESLint** | `pnpm lint` | `0` | 0 errors, 0 warnings. Complies with Next.js 16 and React 19 rules. |
| **Production Build** | `pnpm build` | `0` | Turbopack production build succeeded; all static and dynamic routes compiled. |
| **Rupee & Cart Math Test** | `pnpm test` | `0` | Tested `₹190 * 2 = ₹380`, `₹650 * 1 = ₹650`, Total `₹1,030`. All assertions passed. |
| **Supabase Integration Test** | `pnpm run test:supabase` | `0` | Verified env parsing, URL sanitization, query handling, and anonymous mutation rejection. |

---

## 7. Remaining Risks & Phase 2 Recommendations

1. **Remote SQL Application**: Until [`supabase/combined_phase1_migration_and_seed.sql`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/supabase/combined_phase1_migration_and_seed.sql) is run in the Supabase Dashboard, the application continues safely in local fallback mode.
2. **Order Persistence**: Order placement in Phase 1 remains simulated via `localStorage` and `BroadcastChannel`. Persisting orders to Supabase `orders` and `order_items` tables will take place in Phase 2.
3. **QR Code Security**: Table URLs (e.g. `/table/demo-table-1`) do not yet enforce HMAC/JWT cryptographic signatures. Signed QR tokens and session validation are scheduled for Phase 2.
