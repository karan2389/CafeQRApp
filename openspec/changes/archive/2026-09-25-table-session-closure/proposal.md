# Proposal: Table Session Closure & Billing Controls

## Why

In the Cafe QR Ordering System, customers settle their bills physically with cafe staff (cash, physical card, or in-person UPI). Currently, table order sessions remain active indefinitely without a staff-controlled closure mechanism, creating the risk that subsequent customers scanning a table's QR code inherit previous orders or bills. Additionally, there is no immutable record of when physical payment was confirmed, who confirmed it, and the finalized bill total.

Introducing staff-controlled table session closure guarantees that once physical payment is received, staff can cleanly finalize and close the active session. This securely locks down the historical session against new orders, preserves all order and billing audit trails, and ensures the next QR scan on that table cleanly begins a brand-new table session with a ₹0 running bill.

## What Changes

- **Staff-Controlled Session Closure & Billing**:
  - Add database fields on `public.table_order_sessions` (`closed_at`, `closed_by`, `payment_confirmed_at`, `payment_confirmed_by`, `payment_method`, `final_bill_amount_paise`, `final_bill_amount_inr`).
  - Add an atomic database RPC and protected server endpoint (`POST /api/staff/table-sessions/[id]/close`) restricted to authenticated staff/admins.
  - Implement concurrent closure prevention returning 409 conflict if already closed.
  - Compute immutable final bill server-side from order item snapshots, including DELIVERED orders and excluding CANCELLED orders.
  - Block or warn if unfinished (`NEW`, `PREPARING`) orders exist prior to closure.
- **Customer Order Guarding**:
  - Update `POST /api/orders` to strictly reject order submissions if the associated table order session is not `ACTIVE`, returning structured `SESSION_CLOSED` error.
  - Update `GET /api/orders` to return session status (`ACTIVE` vs `CLOSED`) so client apps know if their session ended.
- **QR Resolution & Fresh Session Lifecycle**:
  - Verify and optimize `resolve_qr_scan` RPC so when the current table session is `CLOSED`, a scan immediately provisions a fresh `ACTIVE` session and new customer scan session, without linking to historical orders.
  - Ensure previous customer cookies remain bound to their historical session and cannot read or write to the new customer's session.
- **Staff Operations UI**:
  - Add session details, bill breakdown, and an explicit "Bill Paid & Close Session" action with a confirmation modal in the Staff Dashboard.
  - Show real-time feedback and update table status without false success.
- **Customer UI Experience**:
  - Display friendly "Session Closed" banner if the customer's session is closed by staff, prompting them to scan the table QR code again for new orders.
  - New session scans present an empty cart and ₹0 running bill.

## Capabilities

### New Capabilities
- `table-session-closure`: Covers staff-authenticated table session closure, physical payment confirmation, server-side final bill computation, post-closure ordering rejection, and next-scan session initialization.

### Modified Capabilities
*(None; no existing OpenSpec specs have been previously declared.)*

## Impact

- **Database**: New migration adding closure audit columns to `table_order_sessions`, indexes, and atomic closure RPC `close_table_session`.
- **API Routes**:
  - New protected staff endpoint: `POST /api/staff/table-sessions/[id]/close`.
  - New protected staff endpoint: `GET /api/staff/table-sessions/[id]/summary` (for previewing bill and unfinished orders).
  - Modified customer endpoint: `POST /api/orders` (strict session status validation and `SESSION_CLOSED` response).
  - Modified customer endpoint: `GET /api/orders` (provides session state).
- **Staff UI**:
  - Kitchen & Staff Dashboard (`components/staff/kitchen-dashboard-client.tsx`): Table session billing widget, closure modal, active vs closed state indicators.
- **Customer UI**:
  - Customer order tracker & running bill (`components/customer/customer-order-tracker.tsx`, `components/customer/customer-page-client.tsx`, `components/customer/running-bill.tsx`): Handles closed session state and prompt to scan again.
- **Tests & Scripts**:
  - New end-to-end verification script `scripts/verify-phase8-session-closure.ts` added to `package.json` as `npm run test:phase8-closure`.
