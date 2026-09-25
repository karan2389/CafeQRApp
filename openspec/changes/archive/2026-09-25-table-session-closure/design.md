# Design: Table Session Closure & Billing Controls

## Context

See [proposal.md](file:///c:/Users/karan/OneDrive/Documents/CAFE%20QR%20PROJECT/Cafe_QR_Ordering_Demo/openspec/changes/table-session-closure/proposal.md) for business motivation.

The current system tracks customer tables through two distinct layers defined in `supabase/migrations/20260922000002_phase2_admin_and_sessions.sql`:
1. `public.table_order_sessions`: The table-level session representing the physical table's cumulative bill (`status IN ('ACTIVE', 'CLOSED')`).
2. `public.customer_scan_sessions`: The device-level scan session pointing to `table_order_session_id`.

Currently, table sessions are created with `status = 'ACTIVE'`, but no staff endpoint or UI exists to transition sessions to `'CLOSED'` upon physical payment. Furthermore, customer order submission (`POST /api/orders`) and QR resolution (`app/qr/route.ts` / `resolve_qr_scan`) must strictly coordinate around this session lifecycle to prevent leaking past bills to new guests or taking orders on closed tables.

## Goals / Non-Goals

**Goals:**
- Provide authenticated staff and administrators with a dedicated endpoint and UI to confirm physical payment (cash, card, UPI) and close active table sessions.
- Compute the final bill strictly server-side using immutable order item snapshots, including `DELIVERED` orders and excluding `CANCELLED` orders.
- Provide atomic database closure preventing double-closure or concurrent state corruption (returning HTTP 409 on conflicts).
- Safely detect unfinished (`NEW`, `PREPARING`) orders before closure, requiring staff resolution.
- Reject order creation on closed table sessions with HTTP 403 `SESSION_CLOSED`.
- Ensure subsequent QR scans on a table with a closed session automatically provision a fresh active table session with a ₹0 running bill and empty cart.
- Completely isolate historical customer scan sessions from future guests.

**Non-Goals:**
- Online payment gateway integration (Stripe, Razorpay, or webhooks). This phase only models staff-confirmed physical settlement.
- Introducing complex taxes, split bills, or discounts not present in the existing database schema.
- Allowing customers to close sessions, modify payment status, or self-reopen closed sessions.

## Decisions

### 1. Database Schema Extension
- **Decision**: Extend `public.table_order_sessions` with audit columns:
  - `closed_at TIMESTAMPTZ`
  - `closed_by UUID REFERENCES auth.users(id)`
  - `payment_confirmed_at TIMESTAMPTZ`
  - `payment_confirmed_by UUID REFERENCES auth.users(id)`
  - `payment_method TEXT CHECK (payment_method IN ('CASH', 'CARD', 'UPI', 'OTHER')) DEFAULT 'CASH'`
  - `final_bill_amount_inr NUMERIC(10,2)`
  - `final_bill_amount_paise BIGINT`
- **Rationale**: Reuses the existing `table_order_sessions` table which already contains `status IN ('ACTIVE', 'CLOSED')` and unique partial index `uq_active_table_order_session` on `(table_id) WHERE (status = 'ACTIVE')`.
- **Alternatives Considered**: Creating a separate `table_bills` or `payments` table. Rejected because `table_order_sessions` is already the root entity for all table orders and scan sessions.

### 2. Atomic Database Closure RPC & API Handler
- **Decision**: Implement a database function `public.close_table_session(...)` and a protected Next.js API endpoint `POST /api/staff/table-sessions/[id]/close`.
  - The function/endpoint locks the session row with `FOR UPDATE` or checks `WHERE id = p_session_id AND status = 'ACTIVE'`.
  - Calculates the total from non-cancelled orders belonging to this session.
  - Validates that no unfinished orders (`NEW`, `PREPARING`) exist unless explicitly overridden with `force: true`.
  - Updates status to `'CLOSED'`, records timestamps, staff ID, payment method, and final calculated amounts.
- **Rationale**: An atomic conditional database update prevents race conditions if multiple staff members click the close button simultaneously. If rows updated = 0, the API returns a 409 Conflict (`SESSION_ALREADY_CLOSED`).

### 3. Server-Side Final Bill Calculation
- **Decision**: Final bill is calculated on the server:
  - Query all orders where `table_order_session_id = :id` and `status != 'CANCELLED'`.
  - For each order, verify against `order_items` snapshots (`unit_price_inr * quantity`).
  - Compute total bill amount in INR and paise.
  - Exclude `CANCELLED` orders completely.
  - Zero-order sessions are supported and finalize to ₹0.
- **Rationale**: Client-submitted totals cannot be trusted for financial settlements.

### 4. Guarding Customer Ordering & Polling
- **Decision**:
  - In `POST /api/orders`, verify `orderSession.status === 'ACTIVE'`. If `CLOSED`, return:
    ```json
    {
      "error": "SESSION_CLOSED",
      "message": "This table session has ended. Please scan the table QR code again to start a new session."
    }
    ```
  - In `GET /api/orders`, include `session_status: scanSession.table_order_sessions.status`.
  - In Customer UI components (`customer-page-client.tsx`, `customer-order-tracker.tsx`), if `session_status === 'CLOSED'` or `SESSION_CLOSED` is returned, display a clear notification dialog informing the customer that their bill has been settled and to scan the QR code again to start a new session.

### 5. Next-Scan Fresh Session Flow
- **Decision**: Audit and leverage `resolve_qr_scan` RPC in `app/qr/route.ts`.
  - When a table's session is `'CLOSED'`, `SELECT id ... WHERE table_id = v_table_id AND status = 'ACTIVE'` returns `NULL`.
  - The RPC immediately inserts a new `table_order_sessions` with `status = 'ACTIVE'` and links a fresh `customer_scan_sessions`.
  - Customer cookies (`cafe_customer_session` and `cafe_table_session_id`) are updated with the new credentials.
  - The new session has no orders, so the running bill starts at ₹0.

### 6. Staff Dashboard UI & Modal
- **Decision**: In `components/staff/kitchen-dashboard-client.tsx`, add a Table Billing & Sessions overview.
  - Displays table status, current running bill, count of delivered vs unfinished orders.
  - Provides a **Bill Paid & Close Session** button.
  - Opens a confirmation modal displaying the server-verified bill amount, payment method selector (Cash / Card / UPI), and warnings if unfinished orders exist.
  - On confirmation, calls `POST /api/staff/table-sessions/[id]/close` and refreshes table sessions without playing unnecessary audio alerts.

## Risks / Trade-offs

- **[Risk: Concurrent order placed during staff closure]** → **Mitigation**: Database transaction/atomic update ensures that if the session becomes `CLOSED`, any order creation happening at that exact millisecond is rejected by the `status = 'ACTIVE'` check.
- **[Risk: Stale customer device viewing subsequent customer orders]** → **Mitigation**: Customer queries strictly filter by `table_order_session_id` tied to the cookie's `customer_scan_sessions` row. Old cookies remain tied to the historical closed session and never see the new session's ID.
- **[Risk: Unfinished orders left in kitchen queue]** → **Mitigation**: The closure API rejects closure with `SESSION_HAS_UNFINISHED_ORDERS` unless staff explicitly confirms the closure with override.

## Migration Plan

1. Create migration `supabase/migrations/20260925000006_phase8_table_session_closure.sql` adding closure columns and indexes to `public.table_order_sessions`, plus `close_table_session` RPC.
2. Ensure backward compatibility: default `status` remains `'ACTIVE'`, existing active sessions continue running uninterrupted.
3. Rollback: Drop newly added columns and RPC if needed; core table references remain intact.
