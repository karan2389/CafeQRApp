# table-session-closure Specification

## Purpose
Enables cafe staff to confirm physical payments and atomically close active table order sessions, locking historical billing records and guaranteeing that subsequent customer QR scans initialize clean, independent table sessions.

## Requirements

### Requirement: Staff-Controlled Physical Payment and Session Closure
The system SHALL provide an authenticated staff-only operation to record physical payment confirmation and close an active table order session. Customers and unauthenticated users MUST NOT be able to close table sessions, modify payment confirmation status, or alter session state.

#### Scenario: Staff successfully closes an active table session
- **WHEN** an authenticated staff member or manager submits a session closure request for an active table order session with the recorded physical payment method
- **THEN** the system updates the table order session status to `CLOSED`, records `closed_at`, `closed_by`, `payment_confirmed_at`, `payment_confirmed_by`, and `payment_method`, and returns a HTTP 200 response with closure details.

#### Scenario: Customer attempts to close a table session
- **WHEN** a customer or unauthenticated client submits a request to the staff closure endpoint
- **THEN** the system rejects the request with HTTP 401 Unauthorized or HTTP 403 Forbidden without modifying the session.

---

### Requirement: Server-Side Final Bill Calculation
The system SHALL calculate the final bill total entirely on the server using immutable order item snapshot records (`unit_price_inr`, `quantity`, and order `total_amount_inr`). The bill MUST include all non-cancelled orders (such as `DELIVERED` orders) and MUST strictly exclude `CANCELLED` orders. The system MUST NOT trust or accept client-submitted bill amounts.

#### Scenario: Final bill calculation accurately reflects valid orders
- **WHEN** a session contains multiple orders with statuses `DELIVERED` and `CANCELLED`
- **THEN** the server computes the final bill by summing only the non-cancelled orders, recording `final_bill_amount_inr` and `final_bill_amount_paise`, matching the customer running bill calculation.

#### Scenario: Session with zero orders
- **WHEN** staff closes a table session that has no orders placed
- **THEN** the server sets the final bill to ₹0 and successfully closes the session.

---

### Requirement: Atomic Closure and Concurrency Protection
The system SHALL execute session closure as an atomic database operation, ensuring that concurrent closure requests from multiple staff members cannot corrupt state or double-close a session.

#### Scenario: Simultaneous closure requests on the same active session
- **WHEN** two staff members or requests attempt to close the same active table session concurrently
- **THEN** exactly one request successfully transitions the session to `CLOSED`, while the conflicting request receives an explicit HTTP 409 Conflict response indicating `SESSION_ALREADY_CLOSED`.

#### Scenario: Closure request for already closed session
- **WHEN** a staff member submits a closure request for a session whose status is already `CLOSED`
- **THEN** the system returns HTTP 409 Conflict with error code `SESSION_ALREADY_CLOSED`.

---

### Requirement: Unfinished Orders Handling
The system SHALL inspect orders belonging to the table session before closure. If orders remain in `NEW` or `PREPARING` state, the system SHALL inform the staff and prevent accidental silent closure unless explicitly reviewed or resolved.

#### Scenario: Attempting closure with active kitchen orders
- **WHEN** a staff member requests session closure while one or more orders are in `NEW` or `PREPARING` state without explicit override confirmation
- **THEN** the system returns HTTP 400 or HTTP 409 with error code `SESSION_HAS_UNFINISHED_ORDERS` detailing the pending order IDs and statuses.

#### Scenario: Closing session after unfinished orders are delivered or cancelled
- **WHEN** all pending orders have been completed to `DELIVERED` or marked `CANCELLED`
- **THEN** the staff closure request proceeds smoothly without errors.

---

### Requirement: Rejection of Orders for Closed Sessions
The customer order creation endpoint (`POST /api/orders`) MUST verify that the referenced table order session is in `ACTIVE` status. If the table session has been closed, the system MUST reject the order creation request and MUST NOT persist any order items.

#### Scenario: Customer attempts to order after table session closure
- **WHEN** a customer device with a cookie linked to a closed table session attempts to create a new order
- **THEN** the system rejects the request with HTTP 403 Forbidden and error code `SESSION_CLOSED`, returning a user-facing message instructing the customer to re-scan the table QR code.

#### Scenario: Order creation attempted concurrently during closure
- **WHEN** an order submission arrives while or immediately after a session is closed
- **THEN** the order creation transaction fails due to the closed session status check and returns `SESSION_CLOSED`.

---

### Requirement: QR Scan Resolution and Fresh Session Initialization
When a customer scans a table QR code whose previous table order session has been closed, the system SHALL automatically create a brand new `ACTIVE` table order session and associate the customer's scan session with the new active session. The new session MUST start with an empty order list and a ₹0 running bill.

#### Scenario: Customer scans QR code of a table with an active session
- **WHEN** a customer scans a QR code for a table that currently has an `ACTIVE` table order session
- **THEN** the system resolves and links the customer scan session to the existing active session without creating a duplicate active session.

#### Scenario: Customer scans QR code of a table after session closure
- **WHEN** a customer scans a table QR code after staff has closed the previous table session
- **THEN** the system inserts a new `ACTIVE` table order session for that table, links a new customer scan session to it, and provides an empty order history and ₹0 running bill.

---

### Requirement: Customer Session Isolation and Cookie Invalidation
The system SHALL prevent customer devices from accessing subsequent table sessions without scanning the physical table QR code. A customer device whose session was closed SHALL NOT receive order updates or running bill totals from subsequent customer sessions on that table.

#### Scenario: Customer browser refreshes after table session was closed and re-opened for new guests
- **WHEN** a customer browser retains a cookie pointing to an older, closed table session
- **THEN** queries for orders return only the historical records of the closed session (or a session closed indicator) and never expose orders or items belonging to the new table session.

---

### Requirement: Historical Order and Session Preservation
The system MUST NEVER delete or alter historical orders, order items, timestamps, prices, or notes when a table order session is closed. All historical records MUST remain available for staff auditing, daily reporting, and analytics.

#### Scenario: Inspecting closed table sessions and orders
- **WHEN** an authorized staff member or administrator views historical records or order audits
- **THEN** all closed table sessions, associated orders, immutable item pricing snapshots, staff closure identities, and timestamps remain completely intact.
