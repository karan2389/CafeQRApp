# Tasks: Table Session Closure & Billing Controls

## 1. Database Migration & Atomic Closure Functions

- [x] 1.1 Create `supabase/migrations/20260925000006_phase8_table_session_closure.sql` adding audit columns (`closed_at`, `closed_by`, `payment_confirmed_at`, `payment_confirmed_by`, `payment_method`, `final_bill_amount_inr`, `final_bill_amount_paise`) to `public.table_order_sessions` with proper indexes. Verify SQL syntax and idempotent execution.
- [x] 1.2 Implement the atomic PostgreSQL function `public.close_table_session` to check session state, compute final bill from non-cancelled orders, detect unfinished orders, and atomically close the session. Verify function grants and execution.

## 2. Server-Side Staff & Customer APIs

- [x] 2.1 Implement `POST /api/staff/table-sessions/[id]/close` protected by `requireStaffApi()`, validating the session ID, computing bill server-side, handling unfinished orders, and preventing concurrent double-closure with HTTP 409. Verify response format and error handling.
- [x] 2.2 Implement `GET /api/staff/table-sessions/[id]/summary` to return table session summary, order breakdown, delivered totals, and unfinished orders for staff pre-closure review. Verify with API tests.
- [x] 2.3 Update `POST /api/orders` to strictly verify that `table_order_sessions.status === 'ACTIVE'`, rejecting closed sessions with HTTP 403 `SESSION_CLOSED` and friendly prompt to re-scan. Verify rejection behavior.
- [x] 2.4 Update `GET /api/orders` to return `session_status` alongside orders so customer clients know when a session has ended. Verify payload structure.

## 3. QR Resolution & Session Isolation

- [x] 3.1 Verify and update `app/qr/route.ts` and `resolve_qr_scan` RPC so that scanning a QR code for a table whose previous session was closed provisions a brand new `ACTIVE` table order session and links a new customer session. Verify session creation.
- [x] 3.2 Ensure cookie and session token isolation: verify that existing customer cookies from a closed session cannot view or append orders to the new customer's session. Verify isolation via test scenarios.

## 4. Staff Kitchen & Operations UI

- [x] 4.1 Update `components/staff/kitchen-dashboard-client.tsx` to display table billing status, active table sessions, running totals, and the "Bill Paid & Close Session" action. Verify UI renders properly.
- [x] 4.2 Build the session closure confirmation modal showing server-verified final bill, physical payment method selection (Cash, Card, UPI), and warnings if unfinished orders exist. Verify modal interactions and API integration.

## 5. Customer UI Experience

- [x] 5.1 Update customer components (`customer-page-client.tsx`, `customer-order-tracker.tsx`) to show a clean "Session Closed" banner/modal when their table session is closed, disabling ordering until a new scan. Verify UI notification.
- [x] 5.2 Verify that a fresh scan after closure displays an empty cart, ₹0 running bill, and enables ordering.

## 6. Verification & Automated Testing

- [x] 6.1 Create `scripts/verify-phase8-session-closure.ts` covering session lifecycle, server bill calculation, unfinished orders, atomic concurrency, order rejection after closure, and new session initialization on QR scan.
- [x] 6.2 Add `test:phase8-closure` to `package.json` and run full project validations (`npm run test:phase8-closure`, `npm run typecheck`, `npm run lint`, `npm run build`). Verify all checks pass without errors.
