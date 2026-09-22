# Production Readiness Audit and Codebase Assessment: Cafe QR Ordering System

**Document Version:** 1.0.0  
**Date:** September 21, 2026  
**Auditor Role:** Senior Full-Stack Architect, Next.js/TypeScript Engineer, Supabase Architect  
**Codebase:** Cafe QR Ordering System (`CafeQRApp`)  
**Primary Reference:** `architecture.md`

---

## 1. Executive Summary

This report delivers a comprehensive **Phase 0: Production Readiness Audit** of the **Cafe QR Ordering System**. The project currently operates as a client-side interactive demo representing a 6-table cafe with customer QR ordering, category navigation, an 18+ age gate, real-time cart and order confirmation, running bills, staff calls with cooldown, and a real-time kitchen operations dashboard with audio alerts.

### Key Audit Findings
1. **Architectural Realignment Status**: The codebase has successfully completed structural modularization into domain-driven layers (`types/`, `schemas/`, `components/customer/`, `components/kitchen/`, `features/`, `lib/`), achieving zero circular dependencies, strict TypeScript compliance (`tsc --noEmit` exit 0), clean linting (`eslint .` exit 0), and a successful Turbopack production build (`next build` exit 0).
2. **Current Execution Model**: The application currently runs entirely in the browser using `localStorage` and `BroadcastChannel` for state synchronization across browser tabs. **No persistent database, server-side authentication, or external API endpoints are currently connected.**
3. **Core Production Readiness Gaps**:
   * **Database & Persistence**: Supabase PostgreSQL tables, foreign keys, and migrations are not yet deployed.
   * **Authentication & Authorization**: Supabase Auth and RBAC are absent; `/kitchen` is publicly accessible without login.
   * **Security Boundary**: Order prices, availability, and session validity are computed on the client. Server-side price recalculation and atomic order persistence must be introduced.
   * **Table Access Security**: Tables are resolved via predictable public URL slugs (`/table/demo-table-1`) rather than cryptographically secure, opaque QR session tokens.
   * **Image Storage**: Images are static local SVGs (`/public/menu/*.svg`) rather than Cloudflare R2 object storage assets.
   * **Automated Testing**: There are currently zero unit, integration, or end-to-end tests configured in the repository.

---

## 2. Project Architecture Summary

The target production architecture specified in `architecture.md` establishes a single-branch MVP with six tables built on the following stack:

```text
                               ┌───────────────────────────┐
                               │         Customers         │
                               │ Mobile Browser (Table QR) │
                               └─────────────┬─────────────┘
                                             │
                                      Scan Opaque QR
                                             │
                                             ▼
┌──────────────────────────┐      ┌─────────────────────────┐      ┌──────────────────────────┐
│   Kitchen / Staff View   │─────▶│   Next.js (App Router)  │◀─────│   Cafe Owner Admin View  │
│   (/kitchen - Protected) │      │   Hosted on Vercel      │      │   (/admin - Protected)   │
└──────────────────────────┘      └──────────┬──────────────┘      └──────────────────────────┘
                                             │
                  ┌──────────────────────────┼──────────────────────────┐
                  │                          │                          │
                  ▼                          ▼                          ▼
        ┌───────────────────┐      ┌───────────────────┐      ┌───────────────────┐
        │   Supabase Auth   │      │    Supabase DB    │      │   Cloudflare R2   │
        │  Staff/Owner RBAC │      │    PostgreSQL     │      │    Menu Images    │
        └───────────────────┘      └─────────┬─────────┘      └───────────────────┘
                                             │
                                             ▼
                                   ┌───────────────────┐
                                   │ Supabase Realtime │
                                   │  Live Order Bus   │
                                   └───────────────────┘
```

### Core Architecture Directives from `architecture.md`
1. **Next.js & TypeScript**: Server-driven application boundary with strong type contracts.
2. **PostgreSQL as Source of Truth**: Supabase PostgreSQL manages durable state, exact integer monetary values in paise, immutable purchase-time order snapshots, and session lifecycles.
3. **Realtime as an Acceleration Layer**: Supabase Realtime delivers live events to the kitchen and customers, but never acts as the primary data store.
4. **Cloudflare R2 for Binary Storage**: Images are decoupled from PostgreSQL and stored in R2.
5. **Server-Authoritative Security**: Client-submitted prices and totals must be ignored by the backend; all inputs must be validated against database state.

---

## 3. Codebase Structure Summary

The codebase is organized according to Next.js App Router conventions and clean architecture boundaries:

```text
Cafe_QR_Ordering_Demo/
├── app/                              # Next.js App Router layer
│   ├── components/demo-webmcp.tsx    # WebMCP browser tools registration
│   ├── kitchen/page.tsx              # Kitchen operations dashboard route
│   ├── table/[slug]/page.tsx         # Customer QR ordering route
│   ├── globals.css                   # Tailwind v4 theme and custom design system tokens
│   ├── layout.tsx                    # Root layout with Toaster and DemoWebMcp
│   ├── page.tsx                      # Landing page with navigation to table and kitchen
│   └── lib/                          # Backward-compatibility adapters
│       ├── demo-data.ts              # Seed data for 6 tables, menu items, and initial orders
│       ├── demo-store.ts             # LocalStorage & BroadcastChannel synchronization
│       ├── types.ts                  # Re-export barrel to @/types
│       └── use-demo-state.ts         # Reactive state subscription hook
├── components/                       # Presentation layer
│   ├── customer/                     # Domain-specific customer UI
│   │   ├── age-gate-dialog.tsx       # 18+ age verification modal
│   │   ├── customer-header.tsx       # Table header with Call Staff trigger
│   │   ├── order-items.tsx           # Categorized line-item renderer
│   │   ├── order-review-dialog.tsx   # Order confirmation dialog with name and note inputs
│   │   ├── product-card.tsx          # Menu item card with quantity increments
│   │   └── running-bill.tsx          # Active session running bill
│   ├── kitchen/                      # Domain-specific kitchen UI
│   │   ├── kitchen-header.tsx        # Dashboard header with audio toggle and reset
│   │   ├── kitchen-order-card.tsx    # Order ticket with status transition actions
│   │   ├── kitchen-table-card.tsx    # Floor grid card with visual status indicators
│   │   ├── kitchen-table-detail.tsx  # Table detail sidebar and close table action
│   │   └── reset-demo-dialog.tsx     # Demo reset confirmation alert dialog
│   └── ui/                           # 61 reusable shadcn/radix UI primitives
├── features/                         # Application business logic and custom hooks
│   ├── kitchen/                      # Kitchen status state machine and Web Audio synthesizer
│   ├── ordering/                     # Cart state hook and order lifecycle transition rules
│   └── service-calls/                # Staff call cooldown timer and dispatch hook
├── lib/                              # Shared application utilities and infrastructure stubs
│   ├── config/env.ts                 # Type-safe environment configuration accessor
│   ├── constants.ts                  # Centralized storage keys, channel names, and limits
│   ├── format.ts                     # Currency (INR) and time formatting helpers
│   ├── r2/index.ts                   # Image URL resolver with local fallback
│   ├── supabase/client.ts            # Supabase client stub and connection detector
│   └── utils.ts                      # CSS class merger (clsx + twMerge)
├── schemas/                          # Zod runtime input validation schemas
│   ├── orders.ts                     # OrderLine and CreateOrder validation
│   ├── service-calls.ts              # Staff call creation and acknowledgement validation
│   └── tables.ts                     # Table slug and status validation
├── types/                            # Domain type definitions
│   ├── demo-state.ts                 # Demo state and event union types
│   ├── menu.ts                       # MenuItem, MenuCategory, MenuSection
│   ├── orders.ts                     # OrderStatus, OrderLine, DemoOrder, CreateOrderInput
│   ├── service-calls.ts              # StaffCallStatus, StaffCall
│   └── tables.ts                     # TableStatus, DemoTable, TableSessionContext
├── public/menu/                      # Static SVG mock images for menu items
├── docs/                             # Documentation and alignment specifications
│   ├── architecture-alignment.md     # Codebase mapping to architecture.md
│   └── production-readiness.md       # Production readiness gap analysis
├── .env.example                      # Documented production environment template
├── architecture.md                   # Authoritative architectural reference
├── package.json                      # Project manifest and scripts
├── tsconfig.json                     # TypeScript compiler configuration
└── eslint.config.mjs                 # ESLint flat configuration (Next.js + React 19)
```

---

## 4. Feature Implementation Matrix

Every core requirement from `architecture.md` is evaluated below against the existing implementation:

| # | Architecture Requirement | Status | Code Evidence / Implementation Details |
| :-: | :--- | :--- | :--- |
| **1** | **Frontend Architecture** | **Implemented** | Next.js 16.3.4 App Router, React 19, Tailwind CSS v4, TypeScript 5.9, modular components in `components/customer/` and `components/kitchen/`. |
| **2** | **Backend Architecture** | **Not implemented** | No Server Actions or API Route Handlers exist for order submission or table sessions; logic executes in client components. |
| **3** | **Supabase Integration** | **Not implemented** | `@supabase/supabase-js` is not installed. `lib/supabase/client.ts` is currently a credential-detection stub. |
| **4** | **Database Design** | **Not implemented** | `db/schema.ts` is empty (inherited D1 template artifact). No Supabase PostgreSQL schema, migrations, or tables exist. |
| **5** | **Authentication** | **Not implemented** | Neither Supabase Auth nor route protection middleware is active. Kitchen and customer pages are publicly accessible. |
| **6** | **Authorization (RBAC)** | **Not implemented** | No staff vs. admin roles are checked. Anyone visiting `/kitchen` can update orders, acknowledge calls, and close tables. |
| **7** | **Row Level Security (RLS)** | **Not implemented** | No database exists yet; hence RLS policies have not been created or enforced. |
| **8** | **Customer QR Access** | **Partially implemented** | Route `/table/[slug]` handles table routing, but uses predictable URL slugs (`demo-table-1`) instead of cryptographic opaque tokens. |
| **9** | **Table & Session Management** | **Partially implemented** | Table states (`ACTIVE` vs `CLOSED`) and table locking are implemented in `app/table/[slug]/page.tsx`, but sessions are not persisted in a database. |
| **10** | **Menu Management** | **Partially implemented** | Menu items exist in `app/lib/demo-data.ts` (10 items across Coffee, Breakfast, Bowls, Bakes, Puffs). No database store or admin CRUD exists. |
| **11** | **Cart & Order Creation** | **Implemented** | Managed via `features/ordering/use-cart.ts` with bounds (max 10), line item totals, and localStorage sync. Order submission in `app/table/[slug]/page.tsx`. |
| **12** | **Order-Item Price Validation** | **Partially implemented** | Cart and order calculations are performed client-side using `demo-data.ts` prices. Server-side price recalculation is not yet implemented. |
| **13** | **Order Status Lifecycle** | **Implemented** | Defined in `features/ordering/order-lifecycle.ts` (`NEW` -> `PREPARING` -> `DELIVERED`). Enforced via UI controls and state updates. |
| **14** | **Kitchen Dashboard** | **Implemented** | Route `/kitchen` in `app/kitchen/page.tsx` with 6-table floor overview, card visual states, elapsed timers, order breakdown, and notes. |
| **15** | **Realtime Updates** | **Partially implemented** | Cross-tab updates operate via browser `BroadcastChannel` (`ember-oak-demo-channel-v1`). Supabase Realtime is not yet wired. |
| **16** | **Service Calls** | **Implemented** | Table service requests with 20s cooldown in `features/service-calls/use-staff-call.ts` and kitchen acknowledge action in `components/kitchen/kitchen-table-detail.tsx`. |
| **17** | **Running Bill** | **Implemented** | Rendered in `components/customer/running-bill.tsx`, aggregating historical orders for the table, line items, and live order status badges. |
| **18** | **Session Closure & Reopening** | **Partially implemented** | "Close table" blocks new orders and staff calls. Reopening via creating a new session is not yet implemented (requires demo reset). |
| **19** | **Age Confirmation (Puffs)** | **Implemented** | 18+ modal dialog in `components/customer/age-gate-dialog.tsx` with `sessionStorage` persistence (`ember-oak-puffs-confirmed`). |
| **20** | **Image Storage** | **Partially implemented** | Menu items reference SVGs in `/public/menu/`. `lib/r2/index.ts` provides resolver logic, but Cloudflare R2 bucket integration is not active. |
| **21** | **Admin Panel** | **Not implemented** | `/admin` route is completely absent. Menu categories, prices, and availability cannot be managed through an authenticated UI. |
| **22** | **Error Handling** | **Partially implemented** | Client toast notifications (`sonner`) handle missing names, closed tables, and call cooldowns. Server error handling is not implemented. |
| **23** | **Security & Abuse Protection** | **Not implemented** | Rate limiting, server validation, secret isolation, and CORS/CSRF protections are not implemented on order endpoints. |
| **24** | **Performance & Rendering** | **Implemented** | Client state updates are optimized with `useMemo` and memoized hooks; static pages build in Turbopack in ~5.6 seconds. |
| **25** | **Automated Testing** | **Not implemented** | `tests/` directory is empty; no Jest, Vitest, or Playwright configurations exist in `package.json`. |
| **26** | **Deployment Readiness** | **Partially implemented** | Builds cleanly for Vercel with Next.js Turbopack; production database and environment secrets are not yet configured. |

---

## 5. Current Application Flows (As Built)

### A. Customer Flow
1. **Entry**: Customer visits `/table/demo-table-1` (or any table slug `demo-table-1` through `demo-table-6`).
2. **Table Resolution**: The page reads `slug` from `useParams()`, searches `state.tables` (initialized from `app/lib/demo-store.ts`).
   * If table is not found, displays "Table not found" fallback screen.
   * If table status is `CLOSED`, displays a closed banner and disables ordering and staff calls.
3. **Menu Browsing**: Renders Main Menu items (Coffee, Breakfast, Bowls, Bakes) using `components/customer/product-card.tsx`.
4. **Age Gate**: Clicking "Puffs menu · 18+" opens `components/customer/age-gate-dialog.tsx` unless `sessionStorage.getItem("ember-oak-puffs-confirmed") === "yes"`. Upon confirmation, sets sessionStorage and scrolls to `#puffs-menu`.
5. **Cart Operations**: Handled via `features/ordering/use-cart.ts`. Increments/decrements are bounded between 0 and 10 and synced to `localStorage.getItem("ember-oak-cart-[slug]")`. Unavailable items (e.g. Burnt Honey Croissant, Classic Gold) disable addition buttons.
6. **Order Review**: Clicking "Place order" (desktop) or "Review order" (mobile sticky bar) opens `components/customer/order-review-dialog.tsx`. Requires Customer Name (>= 2 chars) and optional Kitchen Note (<= 160 chars).
7. **Order Submission**:
   * Generates idempotency key (`crypto.randomUUID()`) and order ID (`order-[timestamp]-[shortKey]`).
   * Updates state via `commit()`: appends order with status `NEW`, item snapshots, and timestamps.
   * Clears cart and kitchen note; displays success toast with order number (`#XXXX`).
8. **Running Bill**: Submitted orders immediately appear in `components/customer/running-bill.tsx` showing order number, submission time, line items, and live status badge.
9. **Staff Call**: Clicking "Call staff" verifies active call and 20s cooldown (`features/service-calls/use-staff-call.ts`), creates a `PENDING` staff call, and initiates a 20s countdown.

### B. Multi-Device Table Flow
* **Synchronization**: Handled via `window.addEventListener("storage")` and `BroadcastChannel("ember-oak-demo-channel-v1")` in `app/lib/use-demo-state.ts`.
* **Multi-Device Behavior**:
  * If two browser tabs or mobile simulators navigate to `/table/demo-table-1`, both connect to the same shared table in `localStorage`.
  * When Phone A places an order, an `ORDER_CREATED` event is broadcast. Phone B updates its state and immediately reflects the new order in its Running Bill.
  * **Gap**: Cart contents (`ember-oak-cart-demo-table-1`) are stored per browser instance (local to the device), which accurately mirrors personal carts. However, if Table 1 is closed from `/kitchen`, both phones receive `TABLE_CLOSED` and immediately lock out further ordering.

### C. Kitchen Flow
1. **Dashboard Route**: Kitchen staff opens `/kitchen`.
2. **Floor Grid**: Renders 6 tables via `components/kitchen/kitchen-table-card.tsx`.
   * Displays visual states computed by `computeVisualState()`: `INACTIVE` (gray), `ACTIVE` (green), `NEW` (orange pulsating), `PREPARING` (blue), `DELIVERED` (soft green).
   * Displays elapsed time of the latest order (e.g. "Just now", "4 mins") and live order counts.
   * If a table has an unacknowledged staff call, a pulsating red bell icon appears on the card.
3. **Audio Alerts**: Handled by Web Audio API synthesizer (`features/kitchen/kitchen-sound.ts`):
   * Plays harmonic chime for Standard orders, distinct chord for Puffs orders, and triple bell chime for Staff Calls when sound is toggled on.
4. **Order Management**: Selecting a table opens `components/kitchen/kitchen-table-detail.tsx`.
   * Staff can acknowledge pending service calls with one click.
   * Staff can advance order status: `NEW` -> `PREPARING` -> `DELIVERED`.
   * Order tickets display customer names, submission times, kitchen notes, and line items partitioned by Main vs. Puffs.
5. **Table Closure & Reset**:
   * Staff can click "Close table and block new orders", which marks the table `CLOSED` and resolves pending calls.
   * Staff can click "Reset demo data" to trigger `components/kitchen/reset-demo-dialog.tsx`, restoring the seeded demo state.

### D. Billing Flow
* **Calculations**:
  * Line total = `unitPricePaise * quantity`.
  * Order total = sum of line totals.
  * Table running bill = sum of all non-cancelled order totals associated with that table.
  * Formatted using `Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" })`.
* **Current Gap**: All bill calculations are performed on client devices using in-memory arrays. No tax breakdown, service charge, receipt generation, or payment gateway integration exists.

---

## 6. Supabase and Database Readiness

### Data Model Readiness Assessment

The target schema defined in `architecture.md` was compared with the codebase types (`types/`):

| Database Table | Schema Status | In Codebase (`types/`) | Missing Database Attributes / Constraints |
| :--- | :--- | :--- | :--- |
| `branches` | **Missing** | Not modeled | Needs UUID `id`, `name`, `created_at`, `updated_at`. |
| `tables` | **Partially modeled** | `types/tables.ts` (`DemoTable`) | Needs `branch_id` FK, `qr_token_hash` (unique), `table_number` (int), `is_active` (bool). |
| `table_sessions` | **Partially modeled** | `types/tables.ts` (`TableSessionContext`) | Needs UUID `id`, `table_id` FK, `status` (`active` \| `closed`), `opened_at`, `closed_at`. |
| `menu_categories`| **Partially modeled** | `types/menu.ts` (`MenuCategory`) | Needs UUID `id`, `branch_id` FK, `name`, `section`, `sort_order`, `is_active`. |
| `menu_items` | **Modeled** | `types/menu.ts` (`MenuItem`) | Needs UUID `id`, `category_id` FK, `price_paise` (int), `image_key`, `is_available`, `requires_age_confirmation`. |
| `orders` | **Modeled** | `types/orders.ts` (`DemoOrder`) | Needs UUID `id`, `table_session_id` FK, `idempotency_key` (unique constraint), `status`, timestamps. |
| `order_items` | **Modeled** | `types/orders.ts` (`OrderLine`) | Needs UUID `id`, `order_id` FK, `menu_item_id` FK, `item_name_snapshot`, `unit_price_snapshot`, `quantity`, `line_total_paise`. |
| `service_calls` | **Modeled** | `types/service-calls.ts` (`StaffCall`) | Needs UUID `id`, `table_session_id` FK, `type`, `status` (`PENDING` \| `ACKNOWLEDGED`), `created_at`, `resolved_at`, `resolved_by`. |
| `staff_profiles` | **Missing** | Not modeled | Needs Supabase Auth `user_id` FK, `role` (`kitchen` \| `cafe_owner`), `full_name`. |

### Database Integration Gaps
1. **Drizzle / D1 Residue**: The repository contains `db/index.ts` and `drizzle.config.ts` configured for Cloudflare D1 (from an earlier starter template). This conflicts with the documented Supabase PostgreSQL requirement and should be cleanly retired during Phase 2.
2. **Supabase Client Library**: `@supabase/supabase-js` and `@supabase/ssr` are not yet installed in `package.json`.
3. **Database Transactions**: Order creation in production requires atomic insertion of the `orders` row and its associated `order_items` children within a single database transaction.

---

## 7. Security Readiness Assessment

| Risk Category | Severity | Finding & Code Evidence | Production Risk Description |
| :--- | :---: | :--- | :--- |
| **Authentication** | **CRITICAL** | `/kitchen` route in [`app/kitchen/page.tsx`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/app/kitchen/page.tsx) has no auth guard. | Anyone with the URL can inspect active cafe tables, view customer names and notes, change order preparation statuses, and close tables. |
| **Price Validation** | **CRITICAL** | Prices and totals in [`app/table/[slug]/page.tsx`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/app/table/%5Bslug%5D/page.tsx) originate in the browser. | A malicious user or script could manipulate the cart payload to send arbitrary prices (e.g., 0 paise) if the server does not recalculate line totals from the database. |
| **QR Table Predictability**| **HIGH** | Routes use sequential slugs: `/table/demo-table-1` to `/table/demo-table-6`. | Anyone can increment the URL slug to place false orders or trigger service calls for neighboring tables without being physically present. |
| **Authorization / RLS** | **HIGH** | No Row Level Security policies or middleware checks exist. | Once connected to Supabase, without strict RLS, public anonymous keys could be used to read or mutate orders from other sessions. |
| **Abuse / Rate Limiting** | **MEDIUM** | Cooldown in [`features/service-calls/use-staff-call.ts`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/features/service-calls/use-staff-call.ts) is enforced only in local state. | Clearing localStorage or sending direct API requests allows an attacker to spam the kitchen with hundreds of service calls or false orders. |
| **Idempotency Scope** | **MEDIUM** | Idempotency key generated via `submissionKey.current ?? crypto.randomUUID()` in client component. | In production, idempotency keys must be enforced by a PostgreSQL unique constraint with a dedicated TTL to avoid duplicate charges or tickets. |
| **Secrets Exposure** | **LOW** | [`.env.example`](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/.env.example) properly marks `SUPABASE_SERVICE_ROLE_KEY` as server-only. | Confirmed safe. No real secrets or private keys are exposed or committed in the repository. |
| **Age Verification** | **INFORMATIONAL** | Age confirmation is stored in `sessionStorage` (`ember-oak-puffs-confirmed`). | Meets UI requirements, but legal compliance requires confirmation metadata to be logged server-side with order snapshots. |

---

## 8. Code Quality and Maintainability Assessment

* **TypeScript Strictness**: Excellent. `tsconfig.json` has `strict: true`, `noEmit: true`, and all domain models in `types/` are strongly typed without the use of `any`.
* **Separation of Concerns**: Clean modular architecture. Reusable UI components in `components/customer/` and `components/kitchen/` do not perform data fetching or hardcoded storage logic. State management is isolated in `features/` and `lib/`.
* **Runtime Input Validation**: `schemas/` provides Zod schemas for orders, tables, and service calls, perfectly positioned to become the validation gate for Next.js Server Actions.
* **Dead Code & Template Artifacts**:
  * `app/chatgpt-auth.ts`: Stray template boilerplate; not imported or utilized.
  * `db/index.ts` & `drizzle.config.ts`: Cloudflare D1 template stubs that should be replaced with Supabase migrations.
  * `examples/d1`: Sample code not used in the application.

---

## 9. Validation Command Results

All validation checks available in the project toolchain were executed. Results:

| Check | Command | Exit Code | Time | Output / Reliability Assessment |
| :--- | :--- | :---: | :---: | :--- |
| **Type Check** | `npx pnpm typecheck` (`tsc --noEmit`) | **0** | ~3.8s | **Reliable**. Zero type errors across all application files, components, and schemas. |
| **ESLint** | `npx pnpm run lint` (`eslint .`) | **0** | ~2.5s | **Reliable**. Zero lint errors or warnings. Full compliance with Next.js and React 19 compiler rules. |
| **Production Build** | `npx pnpm run build` (`next build`) | **0** | ~5.6s | **Reliable**. Turbopack generated an optimized build. Static and dynamic routes compiled without issues. |
| **Unit / E2E Tests** | None (`tests/` is empty) | N/A | N/A | **Missing**. No automated test runner (Vitest/Jest/Playwright) is configured in `package.json`. |

---

## 10. Demo-to-Production Gaps

| Area | Current Demo Implementation | Production Requirement | Affected Files / Roadmap Phase |
| :--- | :--- | :--- | :--- |
| **Data Storage** | In-browser `localStorage` (`ember-oak-demo-state-v1`) | Supabase PostgreSQL relational database | Phase 2 (`supabase/migrations/`) |
| **Realtime Sync** | Browser `BroadcastChannel` (same-machine tabs only) | Supabase Realtime WebSocket channels | Phase 7 (`features/realtime/`) |
| **Authentication** | Unprotected routes | Supabase Auth (Email/Password or Magic Link) | Phase 6 (`app/(auth)/login`, `middleware.ts`) |
| **Authorization** | Open access | Role-based policies (`kitchen`, `cafe_owner`) | Phase 6 (`middleware.ts`, Supabase RLS) |
| **Order Validation** | Client-side calculations | Server Action with DB price lookups and idempotency | Phase 5 (`app/actions/orders.ts`) |
| **QR Table Tokens** | Sequential slugs (`demo-table-1`) | High-entropy opaque cryptographic tokens | Phase 4 (`app/table/[token]/page.tsx`) |
| **Images** | Static local SVGs (`/menu/*.svg`) | Cloudflare R2 object storage with public CDN | Phase 3 (`lib/r2/`, Admin image upload) |
| **Admin Panel** | Not implemented | Authenticated `/admin` dashboard for menu CRUD | Phase 3 (`app/admin/page.tsx`) |
| **Automated Tests** | Zero automated tests | Unit tests for schemas & Playwright E2E flows | Phase 9 (`tests/`) |

---

## 11. Production Migration Risk Register

| ID | Area | Risk Description | Code Evidence | Severity | Likelihood | Impact | Recommendation | Priority | Dependency | Demo Impact |
| :-: | :--- | :--- | :--- | :-: | :-: | :-: | :--- | :-: | :--- | :-: |
| **R-01** | Security | Unprotected kitchen route allows unauthorized operational interference | `app/kitchen/page.tsx` | **Critical** | High | Critical | Introduce Supabase Auth & Next.js middleware | Before Prod | Phase 6 | None if dev bypass is preserved |
| **R-02** | Billing | Client-side price tampering leads to financial discrepancies | `components/customer/order-review-dialog.tsx` | **Critical** | High | Critical | Recalculate all line totals on server using DB prices | Before Prod | Phase 5 | None |
| **R-03** | Data | Concurrent submissions from multiple devices cause lost or duplicate orders | `app/table/[slug]/page.tsx:confirmOrder` | **High** | High | High | Wrap order creation in PostgreSQL transaction with unique idempotency index | Before Prod | Phase 5 | None |
| **R-04** | Access | Predictable table URLs allow off-premise ordering and griefing | `app/table/[slug]/page.tsx` | **High** | High | Medium | Implement opaque QR session tokens resolved server-side | Before Prod | Phase 4 | Slug route can remain as alias |
| **R-05** | Realtime | BroadcastChannel fails across different physical customer and staff devices | `app/lib/use-demo-state.ts` | **High** | High | High | Migrate state subscription to Supabase Realtime broadcast channels | Before Prod | Phase 7 | None |
| **R-06** | Abuse | Spammed staff calls or order submissions overwhelm kitchen | `features/service-calls/use-staff-call.ts` | **Medium** | Medium | Medium | Add server-side rate limiting (Upstash Redis or Postgres timestamp check) | Before Prod | Phase 5 | None |
| **R-07** | Storage | Large images cause memory bloat and slow loads | `public/menu/*.svg` | **Medium** | Low | Medium | Enforce Cloudflare R2 upload size limits (< 2MB) and WebP optimization | Post-MVP | Phase 3 | None |
| **R-08** | QA | Lack of test harness risks regressions during backend integration | `tests/` (empty) | **Medium** | High | High | Set up Vitest for domain schemas and Playwright for critical ordering flow | Before Prod | Phase 9 | None |

---

## 12. Recommended Phased Implementation Plan

```text
Phase 1: Environment & Toolchain Foundation
   │
   ▼
Phase 2: Supabase Schema & Database Migrations
   │
   ▼
Phase 3: Database-Backed Menu & Cloudflare R2
   │
   ▼
Phase 4: Table Sessions & Opaque QR Tokens
   │
   ▼
Phase 5: Secure Server-Side Order Processing
   │
   ▼
Phase 6: Supabase Authentication & RBAC
   │
   ▼
Phase 7: Supabase Realtime Kitchen Dashboard
   │
   ▼
Phase 8: Billing, Table Closure & Operational Controls
   │
   ▼
Phase 9: End-to-End Testing & Production Deployment
```

### Phase 1 — Environment and Toolchain Foundation
* **Objective**: Install Supabase SDK, clean template residue, and establish environment configuration.
* **Actions**:
  * Install `@supabase/supabase-js` and `@supabase/ssr`.
  * Safely remove legacy Cloudflare D1 template stubs (`db/`, `drizzle.config.ts`, `examples/d1`).
  * Verify local `.env.local` resolution.

### Phase 2 — Database and Data Model
* **Objective**: Define PostgreSQL tables in Supabase matching `architecture.md`.
* **Actions**:
  * Create migrations for `branches`, `tables`, `table_sessions`, `menu_categories`, `menu_items`, `orders`, `order_items`, `service_calls`, and `staff_profiles`.
  * Define foreign keys, check constraints (e.g. `price_paise >= 0`), and unique index on `orders(idempotency_key)`.
  * Seed database with the 10 MVP menu items and 6 tables.

### Phase 3 — Menu Integration & Cloudflare R2
* **Objective**: Connect menu browsing to Supabase and configure image hosting.
* **Actions**:
  * Replace static `demo-data.ts` reads with Supabase queries.
  * Connect Cloudflare R2 client in `lib/r2/index.ts`.
  * Build the cafe owner `/admin` page for category, item, price, and image management.

### Phase 4 — Table and Session Management
* **Objective**: Secure QR entry points and model multi-device table sessions.
* **Actions**:
  * Implement opaque token generation and verification.
  * Associate customer devices with active `table_sessions`.
  * Ensure table closure properly terminates the session and prevents new orders.

### Phase 5 — Secure Order Processing
* **Objective**: Move order validation and persistence to Next.js Server Actions.
* **Actions**:
  * Create `app/actions/orders.ts` utilizing Zod schemas from `schemas/orders.ts`.
  * Recompute line totals server-side using current `menu_items` prices.
  * Persist immutable price and name snapshots in `order_items`.

### Phase 6 — Authentication and Authorization
* **Objective**: Lock down staff and administrative surfaces.
* **Actions**:
  * Implement Supabase Auth login at `/login`.
  * Create Next.js `middleware.ts` restricting `/kitchen` to staff and `/admin` to owner.
  * Configure PostgreSQL Row Level Security (RLS) policies.

### Phase 7 — Kitchen Dashboard & Supabase Realtime
* **Objective**: Deliver live multi-device updates across kitchen and customers.
* **Actions**:
  * Replace `BroadcastChannel` with Supabase Realtime channel subscriptions on `orders` and `service_calls`.
  * Retain Web Audio API alert triggers upon incoming database events.

### Phase 8 — Billing & Operational Workflows
* **Objective**: Ensure running bill accuracy and settlement operations.
* **Actions**:
  * Compute running bills exclusively from persisted `order_items` snapshots.
  * Add receipt summary and table checkout workflows.

### Phase 9 — Testing & Production Deployment
* **Objective**: Guarantee zero regressions and launch on Vercel.
* **Actions**:
  * Configure Vitest for schema and utility unit tests.
  * Add Playwright E2E tests for ordering, staff calls, and kitchen updates.
  * Deploy production build to Vercel and connect production Supabase instance.

---

## 13. Smallest Safe First Production Milestone

**Milestone Name:** *Milestone 1 — Supabase Database Foundation & Read-Only Menu Integration*

### Exact Scope
Connect the existing application to a real Supabase PostgreSQL database for menu browsing and table status verification, without altering the working demo order submission or kitchen flow.

### Included Features
1. Installation of `@supabase/supabase-js` and `@supabase/ssr`.
2. Execution of Supabase SQL migrations creating `branches`, `tables`, `menu_categories`, and `menu_items`.
3. Database seeding with the 6 cafe tables and 10 menu items.
4. Updating customer menu browsing (`app/table/[slug]/page.tsx`) to query `menu_items` from Supabase with an automatic fallback to local `demo-data.ts` if credentials are not configured.

### Explicitly Excluded Features
* Supabase Auth login screens (deferred to Phase 6).
* Supabase Realtime subscriptions (deferred to Phase 7).
* Cloudflare R2 direct file uploads (deferred to Phase 3).
* Payment gateway integrations.

### Definition of Done (DoD)
* [ ] Supabase migrations applied successfully to development project.
* [ ] Customer menu displays items queried directly from Supabase PostgreSQL.
* [ ] If database is unreachable or offline, application gracefully falls back to local demo data.
* [ ] `npx pnpm typecheck`, `npx pnpm run lint`, and `npx pnpm run build` pass with exit code 0.
* [ ] No existing demo functionality in `/table/[slug]` or `/kitchen` is broken.

### Remaining Risks After Milestone
* Order placement remains local/mocked until Phase 5.
* Kitchen dashboard remains local/mocked until Phase 7.

---

## 14. Open Questions & Architectural Decisions Required

1. **Cancellation Window**: Can customers cancel an order directly from their phone, or can cancellations only be performed by kitchen staff? If customer cancellation is allowed, up to what state (`NEW` only, or also `PREPARING`)?
2. **Payment Processing**: Will customers pay at the table via digital payment gateway (e.g. Razorpay/Stripe), or pay at the physical counter prior to table closure?
3. **Session Reopening**: When a closed table is reopened, should staff manually click "Reopen Table" in the kitchen dashboard, or should scanning the table QR automatically generate a fresh session?
4. **Age Confirmation Compliance**: Does local regulation require storing proof (such as a timestamp and client acknowledgment flag) alongside the order record in PostgreSQL for Puffs?
5. **Image Delivery**: Should menu images uploaded to Cloudflare R2 be publicly served via a custom CDN domain, or do they require signed URLs?

---

## 15. Final Recommendations

1. **Approve Phase 0 Audit**: Review this assessment and align on the proposed Phase 1–9 roadmap.
2. **Retire D1 Artifacts**: Remove legacy Cloudflare D1 template stubs (`db/`, `drizzle.config.ts`, `examples/d1`) during Phase 1 to eliminate architectural ambiguity.
3. **Adopt Milestone 1 First**: Proceed with the recommended Smallest Safe First Production Milestone (Supabase DB schema + read-only menu integration) to establish backend connectivity safely without disrupting demo operations.
4. **Preserve Dual-Mode Capability**: Maintain local fallback mocks in `lib/demo/` so that the client-ready demo can continue running offline or in preview environments without requiring active database connections.
