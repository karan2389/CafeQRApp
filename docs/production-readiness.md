# Production Readiness & Architecture Alignment Gap Analysis

This document outlines the current state of the **Cafe QR Ordering System**, explains how the refactored code maps to `architecture.md`, and details the remaining implementation steps needed to transition from the interactive demo to full production.

---

## 1. Executive Summary

The codebase has been refactored from a monolithic prototype into a modular, domain-driven structure. All existing demo functionality—such as customer menu browsing, real-time cart, 18+ Puffs age gate, order reviews, multi-tab synchronization, running bills, staff calls with cooldown, visual table states, status transitions, and Web Audio alerts—is **100% preserved**.

Domain types, Zod validation schemas, UI components, and business rules have been isolated into clean modules ready for gradual backend integration.

---

## 2. Current Architecture Mapping

| Layer | Refactored Code Location | Responsibilities | Production Transition Path |
| :--- | :--- | :--- | :--- |
| **Domain Models** | `types/` (`menu.ts`, `orders.ts`, `tables.ts`, `service-calls.ts`, `demo-state.ts`) | Strict TypeScript interfaces for all cafe domain entities | Map 1:1 with Supabase database tables and generated schema types |
| **Validation Layer** | `schemas/` (`orders.ts`, `tables.ts`, `service-calls.ts`) | Zod schemas defining validation rules for names, notes, quantities, items, and transitions | Integrate directly into Next.js Server Actions and API Route Handlers |
| **Presentation (Customer)** | `components/customer/` (`customer-header.tsx`, `product-card.tsx`, `order-items.tsx`, `running-bill.tsx`, `age-gate-dialog.tsx`, `order-review-dialog.tsx`) | Mobile-first UI components for table ordering | Connect to server actions rather than localStorage state |
| **Presentation (Kitchen)** | `components/kitchen/` (`kitchen-header.tsx`, `kitchen-table-card.tsx`, `kitchen-order-card.tsx`, `kitchen-table-detail.tsx`, `reset-demo-dialog.tsx`) | 6-table floor operations dashboard and order review | Connect to Supabase Realtime channels for orders and staff calls |
| **Feature / Business Logic** | `features/` (`ordering/use-cart.ts`, `ordering/order-lifecycle.ts`, `service-calls/use-staff-call.ts`, `kitchen/kitchen-status.ts`, `kitchen/kitchen-sound.ts`) | Reusable hooks and pure state machines | Share lifecycle logic between client feedback and server transition guards |
| **Data Access & State** | `app/lib/` & `lib/demo/` | In-browser LocalStorage and BroadcastChannel synchronization for zero-backend demo | Replace with Supabase PostgreSQL client and Realtime hooks |
| **Infrastructure Stubs** | `lib/supabase/client.ts`, `lib/r2/index.ts`, `lib/config/env.ts` | Config access, R2 image resolution, Supabase setup check | Populate `.env.local` with real project credentials |

---

## 3. Production Readiness Gaps & Implementation Roadmap

The following infrastructure and backend tasks remain before launch:

### A. Database & Migrations (Supabase PostgreSQL)
- **Tables Needed**:
  - `branches` (MVP supports 1 branch)
  - `tables` (UUID, `table_number`, `branch_id`, `qr_token_hash`, `is_active`)
  - `table_sessions` (UUID, `table_id`, `status: active | closed`, `opened_at`, `closed_at`)
  - `menu_categories` (UUID, `branch_id`, `name`, `section: MAIN | PUFFS`, `sort_order`, `is_active`)
  - `menu_items` (UUID, `category_id`, `name`, `description`, `price_paise`, `image_key`, `is_available`, `requires_age_confirmation`)
  - `orders` (UUID, `table_session_id`, `order_number`, `idempotency_key`, `customer_name`, `kitchen_note`, `status`, timestamps)
  - `order_items` (UUID, `order_id`, `menu_item_id`, `item_name_snapshot`, `unit_price_snapshot`, `quantity`, `line_total_paise`)
  - `service_calls` (UUID, `table_session_id`, `type`, `status: PENDING | ACKNOWLEDGED`, timestamps, `acknowledged_by`)
- **Action**: Write SQL migrations in `supabase/migrations/` using exact integer prices in paise.

### B. Server-Side Price & Order Validation
- In production, client cart totals must never be trusted.
- When an order is submitted:
  1. Validate the active table session.
  2. Load current prices from `menu_items` in PostgreSQL.
  3. Calculate line totals and grand total on the server.
  4. Store purchase-time immutable snapshots in `order_items`.
  5. Check `idempotency_key` in a PostgreSQL unique index or transaction to prevent double submission.

### C. Authentication & Authorization (Supabase Auth)
- Customers access the menu anonymously via their validated table QR token.
- Staff and Cafe-Owner require authentication:
  - Implement `/login` with Supabase Auth.
  - Role-based access control (RBAC): Staff (`kitchen` role) vs. Admin (`cafe_owner` role).
  - Protect `/kitchen` and `/admin` routes using Next.js Middleware.

### D. Supabase Row Level Security (RLS)
- Configure RLS policies:
  - `menu_items`: Public read for active items. Owner-only insert/update/delete.
  - `table_sessions`: Customer can read their own session via opaque token. Staff can read all.
  - `orders` & `order_items`: Read/insert permitted only for the active table session. Staff can update status.
  - `service_calls`: Customer can insert for their session. Staff can acknowledge.

### E. Cloudflare R2 Image Storage
- In production, upload menu item images through the Admin Panel:
  1. Generate pre-signed upload URL from server action.
  2. Client uploads image directly to Cloudflare R2.
  3. Server stores image object key in `menu_items.image_key`.
  4. Customer application resolves images through `resolveImageUrl(item.image_key)`.

### F. Opaque QR Tokens for Table Entry
- Replace public table slugs (`/table/demo-table-1`) with high-entropy opaque tokens (e.g. `/table/t_9f8c2b1a...`).
- Resolve token on server: verify table is active and return the active session context.
- Rotate tokens if tables are reconfigured.

### G. Operational Monitoring & Rate Limiting
- Implement Upstash / Redis rate limiting on order submissions and staff calls.
- Add error logging (e.g., Sentry) to capture order creation failures and failed realtime subscriptions.
