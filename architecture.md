# Cafe QR Ordering System --- Architecture

## 1. Document Purpose

This document describes the proposed final technology stack and
high-level architecture for the Cafe QR Ordering System MVP.

It is based on the architecture decisions made during project planning,
not on an inspection of an existing codebase. It should be used as a
shared implementation reference for the development team.

------------------------------------------------------------------------

## 2. Project Scope

The MVP supports one cafe branch with six tables.

### Customer capabilities

-   Scan a QR code associated with a table.
-   View the current menu.
-   Browse menu categories.
-   View item details, prices, availability, and images.
-   Add items to a cart.
-   Confirm and submit an order.
-   Add more items from multiple phones using the same table session.
-   Request service from the cafe staff.
-   View the running bill for the active table session.
-   Receive order-status updates.

### Kitchen and staff capabilities

-   Sign in to a protected kitchen/staff dashboard.
-   View incoming orders.
-   Accept orders.
-   Move orders through preparation states.
-   Mark orders as ready.
-   Mark orders as delivered.
-   View and manage service calls.
-   See the active table/session context for each order.

### Cafe-owner capabilities

-   Sign in to a protected admin panel.
-   Manage menu categories.
-   Create, edit, and deactivate menu items.
-   Update prices and descriptions.
-   Manage item availability.
-   Upload and manage menu images.
-   Manage the cafe's operational data through the custom admin panel.

------------------------------------------------------------------------

## 3. Final Technology Stack

  -----------------------------------------------------------------------
  Area                    Technology              Responsibility
  ----------------------- ----------------------- -----------------------
  Frontend and            Next.js                 Customer application,
  application framework                           kitchen dashboard,
                                                  admin panel,
                                                  server-side application
                                                  features

  Language                TypeScript              Type-safe application
                                                  development

  Styling                 Tailwind CSS            UI styling and
                                                  responsive layouts

  Hosting and deployment  Vercel                  Application hosting,
                                                  deployments, preview
                                                  environments, and
                                                  production hosting

  Database                Supabase PostgreSQL     Persistent application
                                                  data

  Realtime updates        Supabase Realtime       Live order-status and
                                                  dashboard updates

  Authentication          Supabase Auth           Staff and cafe-owner
                                                  authentication

  Image storage           Cloudflare R2           Menu-item and other
                                                  application image
                                                  storage

  Customer session        Opaque QR/table session Identifying a table
  identity                tokens                  session without
                                                  exposing predictable
                                                  identifiers

  Menu management         Custom cafe-owner admin Source of truth for
                          panel                   menu data

  Menu data storage       Supabase PostgreSQL     Categories, items,
                                                  prices, availability,
                                                  and related menu
                                                  metadata
  -----------------------------------------------------------------------

### Explicitly excluded from the final stack

The final architecture does not use:

-   Google Sheets as the menu database.
-   Google Drive as the primary image-storage system.
-   A separate third-party cafe-owner CMS for menu management.

The menu is managed through the custom admin panel and stored in
Supabase PostgreSQL. Images are stored in Cloudflare R2.

------------------------------------------------------------------------

## 4. High-Level Architecture

``` text
                         ┌─────────────────────┐
                         │      Customers      │
                         │  Mobile Web Browser │
                         └──────────┬──────────┘
                                    │
                              Scan Table QR
                                    │
                                    ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│ Kitchen / Staff     │────▶│      Next.js        │◀────│ Cafe Owner Admin    │
│ Dashboard           │     │ Application on      │     │ Panel               │
│                     │     │ Vercel              │     │                     │
└─────────────────────┘     └──────────┬──────────┘     └─────────────────────┘
                                        │
                 ┌──────────────────────┼──────────────────────┐
                 │                      │                      │
                 ▼                      ▼                      ▼
       ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
       │ Supabase Auth   │    │ Supabase         │    │ Cloudflare R2   │
       │                 │    │ PostgreSQL       │    │                 │
       │ Staff/admin     │    │ Application      │    │ Menu images     │
       │ authentication  │    │ data             │    │                 │
       └─────────────────┘    └────────┬────────┘    └─────────────────┘
                                        │
                                        ▼
                              ┌─────────────────┐
                              │ Supabase        │
                              │ Realtime        │
                              │                 │
                              │ Live order and  │
                              │ service updates │
                              └─────────────────┘
```

------------------------------------------------------------------------

## 5. Application Structure

The Next.js application should be organized around the major product
surfaces.

### Customer application

Responsible for:

-   Table/session entry from QR codes.
-   Menu browsing.
-   Cart management.
-   Order confirmation.
-   Order tracking.
-   Running bill display.
-   Service-call requests.

The customer experience should be mobile-first because customers will
primarily access it from their phones.

### Kitchen/staff dashboard

Responsible for:

-   Viewing new orders.
-   Accepting orders.
-   Updating order status.
-   Viewing order details.
-   Managing service calls.
-   Filtering orders by status or table where useful.

This area must be protected by authentication and authorization.

### Cafe-owner admin panel

Responsible for:

-   Managing menu categories.
-   Managing menu items.
-   Managing item prices.
-   Managing item availability.
-   Managing item descriptions and images.
-   Maintaining the menu data used by the customer application.

This area must also be protected by authentication and authorization.

### Shared application services

Shared server-side logic should handle:

-   Table/session validation.
-   Menu retrieval.
-   Server-side price validation.
-   Order creation.
-   Order-status transitions.
-   Bill calculations.
-   Service-call creation.
-   Authentication and authorization checks.
-   Input validation.
-   Idempotency handling.
-   Rate limiting where appropriate.

------------------------------------------------------------------------

## 6. Core Domain Concepts

### Branch

The cafe location represented by the system.

The MVP supports one branch, but the data model should avoid unnecessary
assumptions that would prevent future expansion to multiple branches.

### Table

A physical cafe table.

The MVP contains six tables. Each table should have a stable internal
identifier and an associated QR-code entry point.

### Table session

An active customer session associated with a table.

A table session:

-   Allows multiple phones to place orders for the same table.
-   Owns the running bill.
-   Remains active until staff or an authorized workflow closes it.
-   Prevents additional orders after closure.
-   Can be reopened by creating a new session.

### Menu category

A grouping of menu items, such as food or beverages.

### Menu item

A sellable item with data such as:

-   Name.
-   Description.
-   Price.
-   Category.
-   Availability.
-   Image reference.
-   Age-restriction metadata where applicable.

### Order

A customer-submitted request for one or more menu items.

An order belongs to a table session and contains immutable item
snapshots so that later menu changes do not alter historical orders.

### Order item

A line item within an order.

The order item should preserve at least:

-   Menu item reference.
-   Item name at purchase time.
-   Unit price at purchase time.
-   Quantity.
-   Line total.
-   Relevant item metadata required for historical accuracy.

### Service call

A request from a table for staff assistance.

Examples include:

-   Requesting staff.
-   Requesting the bill.
-   Requesting water or other assistance.

### Bill

The running financial summary for an active table session.

The bill should be calculated from persisted order data rather than from
client-submitted totals.

------------------------------------------------------------------------

## 7. Order Lifecycle

The order lifecycle is:

``` text
New → Accepted → Preparing → Ready → Delivered
```

### State definitions

  -----------------------------------------------------------------------
  State                               Meaning
  ----------------------------------- -----------------------------------
  New                                 Order has been submitted by a
                                      customer and is awaiting staff
                                      action

  Accepted                            Staff has acknowledged the order

  Preparing                           Kitchen is preparing the order

  Ready                               Order is ready for delivery

  Delivered                           Order has been delivered to the
                                      table
  -----------------------------------------------------------------------

### Cancellation

Cancellation is permitted only in the early states defined by the
business rules. The implementation must enforce valid transitions
server-side rather than relying only on UI controls.

### Transition rules

Order-status transitions should be represented as an explicit state
machine or centralized transition validator.

The client must not be able to set arbitrary status values.

------------------------------------------------------------------------

## 8. Proposed Data Model

The following is the recommended logical data model. Exact table names
and columns should be finalized during implementation.

### `branches`

Stores cafe branch information.

Suggested fields:

-   `id`
-   `name`
-   `created_at`
-   `updated_at`

### `tables`

Stores physical tables.

Suggested fields:

-   `id`
-   `branch_id`
-   `table_number`
-   `qr_token_hash` or equivalent secure QR identifier
-   `is_active`
-   `created_at`
-   `updated_at`

### `table_sessions`

Stores active and historical table sessions.

Suggested fields:

-   `id`
-   `table_id`
-   `status`
-   `opened_at`
-   `closed_at`
-   `created_at`
-   `updated_at`

Possible statuses:

-   `active`
-   `closed`

### `menu_categories`

Stores menu categories.

Suggested fields:

-   `id`
-   `branch_id`
-   `name`
-   `description`
-   `sort_order`
-   `is_active`
-   `created_at`
-   `updated_at`

### `menu_items`

Stores menu items.

Suggested fields:

-   `id`
-   `branch_id`
-   `category_id`
-   `name`
-   `description`
-   `price`
-   `image_key`
-   `is_available`
-   `requires_age_confirmation`
-   `sort_order`
-   `created_at`
-   `updated_at`

### `orders`

Stores customer orders.

Suggested fields:

-   `id`
-   `table_session_id`
-   `status`
-   `idempotency_key`
-   `created_at`
-   `updated_at`
-   `accepted_at`
-   `preparing_at`
-   `ready_at`
-   `delivered_at`
-   `cancelled_at`

### `order_items`

Stores immutable snapshots of items ordered.

Suggested fields:

-   `id`
-   `order_id`
-   `menu_item_id`
-   `item_name_snapshot`
-   `unit_price_snapshot`
-   `quantity`
-   `line_total`
-   `created_at`

### `service_calls`

Stores requests for staff assistance.

Suggested fields:

-   `id`
-   `table_session_id`
-   `type`
-   `status`
-   `created_at`
-   `resolved_at`
-   `resolved_by`

### `staff profiles / roles`

Supabase Auth should manage identity. Application-level profile or role
data should define whether a user is:

-   Kitchen/staff.
-   Cafe owner/admin.

The precise implementation may use a profile table, role claims, or
another secure authorization approach. Regardless of implementation,
authorization must be enforced server-side.

------------------------------------------------------------------------

## 9. QR-Code and Table Access Design

QR codes should not expose predictable table identifiers directly.

### Recommended approach

1.  Generate a high-entropy opaque token for each table.
2.  Store only a secure representation of the token where practical.
3.  Encode the token in the QR URL.
4.  Resolve the token server-side.
5.  Validate that the associated table is active.
6.  Resolve or create the appropriate active table session.
7.  Allow customer actions only within the validated session context.

### Security requirements

-   Do not use sequential table IDs as customer authorization tokens.
-   Do not trust table IDs supplied by the browser.
-   Validate the QR token on the server.
-   Do not allow a customer to access another table's session by
    modifying URL parameters.
-   Consider token rotation if QR codes need to be invalidated.

------------------------------------------------------------------------

## 10. Customer Ordering Flow

``` text
Customer scans QR
        │
        ▼
Validate opaque table token
        │
        ▼
Resolve active table session
        │
        ▼
Load menu from Supabase
        │
        ▼
Customer adds items to cart
        │
        ▼
Customer confirms order
        │
        ▼
Server validates:
- Session is active
- Items exist
- Items are available
- Prices are current
- Quantities are valid
- Age confirmation is satisfied where required
- Request is not a duplicate
        │
        ▼
Create order and immutable order-item snapshots
        │
        ▼
Publish realtime update
        │
        ▼
Kitchen dashboard receives new order
```

The browser may display prices and totals for usability, but the server
must recalculate and validate all monetary values.

------------------------------------------------------------------------

## 11. Multiple Phones per Table

Multiple customer devices must be able to participate in the same active
table session.

The system should treat the table session as the shared ordering context
rather than treating each phone as an independent bill.

### Requirements

-   Each valid QR entry resolves to the same active table session.
-   Orders from different phones are associated with the same session.
-   The running bill aggregates all orders in that session.
-   Closing the session prevents new orders.
-   A new session is created when the table is reopened.
-   Customer clients should not be able to change the session ID
    arbitrarily.

------------------------------------------------------------------------

## 12. Realtime Architecture

Supabase Realtime should be used for operational updates where live
information improves the experience.

### Realtime use cases

-   New orders appearing in the kitchen dashboard.
-   Order status changes.
-   Service-call updates.
-   Relevant table/session changes.
-   Customer order tracking updates.

### Recommended behavior

-   Persist the change in PostgreSQL first.
-   Broadcast or expose the persisted change through Supabase Realtime.
-   Treat the database as the source of truth.
-   Make clients resilient to missed events by refetching current state.
-   Avoid assuming that a realtime event was received exactly once.
-   Use authorization rules so clients only receive data appropriate to
    their role and session.

Realtime should improve responsiveness, not replace durable database
state.

------------------------------------------------------------------------

## 13. Authentication and Authorization

### Supabase Auth

Supabase Auth should be used for:

-   Kitchen/staff login.
-   Cafe-owner/admin login.
-   Session management.
-   Sign-out.
-   Password or supported identity-provider flows as selected during
    implementation.

Customers do not need a traditional account for the MVP. Their access is
based on the validated table QR/session context.

### Authorization boundaries

#### Customers

May:

-   Read the menu.
-   Create orders for their authorized active table session.
-   View permitted order information for that session.
-   Create service calls for that session.
-   View the running bill for that session.

Must not:

-   Access other tables.
-   Change menu data.
-   Change prices.
-   Change staff/admin data.
-   Update arbitrary order statuses.
-   Close or reopen sessions unless explicitly authorized.

#### Kitchen/staff

May:

-   View operational orders.
-   Update permitted order statuses.
-   View relevant table/session information.
-   Resolve service calls.

#### Cafe owner/admin

May:

-   Manage menu categories and items.
-   Manage prices and availability.
-   Manage images.
-   Access administrative functions.

Authorization must be enforced on the server and, where applicable,
through Supabase Row Level Security policies.

------------------------------------------------------------------------

## 14. Supabase PostgreSQL Responsibilities

Supabase PostgreSQL is the primary source of truth for structured
application data.

It should store:

-   Branches.
-   Tables.
-   Table sessions.
-   Menu categories.
-   Menu items.
-   Orders.
-   Order items.
-   Service calls.
-   Staff/admin profile and role information.
-   Audit fields and timestamps.

### Database principles

-   Use foreign keys for relationships.
-   Add indexes for common query paths.
-   Use constraints for valid values where appropriate.
-   Store monetary values using a suitable exact numeric representation.
-   Use timestamps consistently.
-   Preserve historical order data through snapshots.
-   Avoid trusting client-calculated totals.
-   Use transactions for operations that must be atomic.

------------------------------------------------------------------------

## 15. Cloudflare R2 Image Storage

Cloudflare R2 should store menu images rather than storing image
binaries directly in PostgreSQL.

### Recommended image flow

1.  Cafe owner selects an image in the admin panel.
2.  The application authorizes the upload.
3.  The image is uploaded to R2 using a secure server-generated
    mechanism.
4.  The resulting object key is stored in `menu_items`.
5.  The customer application resolves the image URL when displaying the
    menu.

### Image requirements

-   Validate file type.
-   Validate file size.
-   Generate safe object keys.
-   Do not trust user-supplied object paths.
-   Avoid exposing private administrative upload credentials.
-   Consider image resizing or optimization.
-   Remove or mark unused images when menu items are deleted or
    replaced.
-   Keep image storage separate from transactional database data.

------------------------------------------------------------------------

## 16. Vercel Deployment

Vercel should host the Next.js application.

### Expected environments

-   Local development.
-   Preview deployments.
-   Production deployment.

### Environment configuration

Environment variables should be used for:

-   Supabase project URL.
-   Supabase public/anonymous key.
-   Supabase server-side key where required.
-   Cloudflare account information.
-   Cloudflare R2 bucket information.
-   R2 access credentials.
-   Application URL.
-   Other environment-specific configuration.

Secrets must not be committed to source control.

### Deployment principles

-   Use preview deployments for feature validation.
-   Protect production secrets.
-   Keep development, preview, and production configuration separated.
-   Use server-only environment variables for privileged credentials.
-   Never expose service-role keys or R2 secret credentials to the
    browser.

------------------------------------------------------------------------

## 17. Security Requirements

### Input validation

Validate all client input on the server, including:

-   QR/session tokens.
-   Menu item IDs.
-   Quantities.
-   Order payloads.
-   Service-call types.
-   Status-transition requests.
-   Admin form data.
-   Image metadata.

### Price validation

The server must:

-   Load current menu prices from PostgreSQL.
-   Ignore client-submitted prices as authoritative.
-   Calculate line totals and order totals server-side.
-   Store price snapshots in order items.

### Idempotency

Order submission should support idempotency to prevent duplicate orders
caused by:

-   Double taps.
-   Browser retries.
-   Network retries.
-   Repeated requests.
-   Realtime or UI race conditions.

An idempotency key should be unique within the appropriate scope and
enforced server-side.

### Row Level Security

Supabase RLS should be used where applicable to ensure that:

-   Customers cannot read unrelated sessions or orders.
-   Staff can access operational data appropriate to their role.
-   Admins can manage authorized menu data.
-   Public access is limited to intentionally public menu information.

### Rate limiting

Consider rate limiting for:

-   Order creation.
-   Service-call creation.
-   QR/session resolution.
-   Authentication endpoints.
-   Image uploads.
-   Public menu endpoints if abuse becomes a concern.

### Auditability

Important operational changes should include:

-   Actor identity where applicable.
-   Timestamp.
-   Previous and new status where useful.
-   Relevant record identifiers.

------------------------------------------------------------------------

## 18. Puffs Age Confirmation

The puffs category requires age confirmation.

### Recommended implementation

-   Store a `requires_age_confirmation` flag on the relevant menu item
    or category.
-   Display an age-confirmation step before the item can be ordered.
-   Do not rely only on a client-side visual checkbox.
-   Include the confirmation state in the order request.
-   Validate the requirement server-side.
-   Record the relevant confirmation metadata if required by the cafe's
    legal and operational policy.

The exact legal wording, minimum age, and compliance requirements must
be confirmed with the cafe owner and applicable local regulations before
production launch.

------------------------------------------------------------------------

## 19. Running Bill and Session Closure

The running bill should be derived from orders belonging to the active
table session.

### Requirements

-   Include all eligible orders in the active session.
-   Use persisted order-item price snapshots.
-   Exclude cancelled orders according to the business rules.
-   Recalculate totals from database data.
-   Do not accept client-submitted totals.
-   Clearly distinguish active and closed sessions.
-   Prevent new orders after closure.
-   Create a new session when the table is reopened.

If taxes, discounts, service charges, or payment processing are
introduced later, they should be represented explicitly rather than
embedded in client-side calculations.

------------------------------------------------------------------------

## 20. Suggested Next.js Boundaries

The exact folder structure may be chosen by the implementation team, but
the application should maintain clear boundaries between:

### UI components

-   Menu cards.
-   Category navigation.
-   Cart components.
-   Order status components.
-   Kitchen order cards.
-   Admin forms.
-   Service-call controls.

### Domain logic

-   Order validation.
-   Status transitions.
-   Bill calculation.
-   Session validation.
-   Age-confirmation rules.

### Data-access layer

-   Supabase queries.
-   Database mutations.
-   Realtime subscriptions.
-   R2 upload helpers.

### Server-side operations

-   Protected route handlers or server actions.
-   Authentication checks.
-   Authorization checks.
-   Idempotency enforcement.
-   Price validation.
-   Transactional order creation.

### Shared types and schemas

-   Domain types.
-   Request/response types.
-   Validation schemas.
-   Status enums.
-   Role definitions.

The project should avoid placing business-critical validation only
inside React components or browser-side code.

------------------------------------------------------------------------

## 21. Operational Considerations

### Supabase Free Tier

The expected menu size of approximately 70--80 items is small for a
PostgreSQL database. The menu itself should not be the main capacity
concern.

The team should monitor:

-   Database usage.
-   Realtime connections and messages.
-   Bandwidth.
-   Project pausing behavior.
-   Storage and backup requirements.
-   Production traffic.
-   Image delivery traffic, which should primarily be handled through R2
    rather than Supabase Storage.

The exact limits and pricing should be rechecked before production
launch because provider plans can change.

### Observability

At minimum, the application should provide:

-   Server error logging.
-   Client error visibility.
-   Order-creation failure logs.
-   Authentication failure logs.
-   Admin-operation logs.
-   Monitoring for failed image uploads.
-   Monitoring for realtime subscription failures.

### Backups and recovery

The team should define:

-   Database backup expectations.
-   Recovery procedures.
-   Data retention.
-   How to recover from accidental menu changes.
-   How to handle lost or invalid QR tokens.

------------------------------------------------------------------------

## 22. MVP Delivery Priorities

### Phase 1 --- Foundation

-   Initialize Next.js, TypeScript, and Tailwind CSS.
-   Configure Vercel deployment.
-   Create Supabase project and database.
-   Configure Supabase Auth.
-   Configure environment variables.
-   Configure Cloudflare R2.

### Phase 2 --- Menu and table foundation

-   Create branch and table records.
-   Create QR-token handling.
-   Create menu categories and items.
-   Build the cafe-owner admin panel.
-   Implement image upload and display.

### Phase 3 --- Customer ordering

-   Build QR/session entry.
-   Build menu browsing.
-   Build cart.
-   Implement server-side order validation.
-   Implement order creation and idempotency.
-   Implement order history for the active table session.

### Phase 4 --- Kitchen operations

-   Build authenticated kitchen dashboard.
-   Implement order lifecycle transitions.
-   Add realtime order updates.
-   Add service-call management.

### Phase 5 --- Bill and closure

-   Implement running bill.
-   Implement session closure.
-   Prevent orders against closed sessions.
-   Implement session reopening through a new session.

### Phase 6 --- Hardening

-   Add RLS policies.
-   Add rate limiting.
-   Test authorization boundaries.
-   Test duplicate submissions.
-   Test concurrent ordering from multiple phones.
-   Test realtime recovery behavior.
-   Test image upload security.
-   Test age-confirmation enforcement.
-   Test backup and recovery procedures.

------------------------------------------------------------------------

## 23. Key Architectural Decisions

1.  **Next.js is the application framework.**
2.  **TypeScript is used throughout the application.**
3.  **Tailwind CSS is used for styling.**
4.  **Vercel hosts the Next.js application.**
5.  **Supabase PostgreSQL is the source of truth for structured data.**
6.  **Supabase Realtime provides live operational updates.**
7.  **Supabase Auth protects staff and cafe-owner areas.**
8.  **Cloudflare R2 stores menu images.**
9.  **The custom cafe-owner admin panel manages the menu.**
10. **Google Sheets is not used as the production menu database.**
11. **Google Drive is not used as the production image store.**
12. **Opaque QR tokens are used for table access.**
13. **Prices and totals are validated and calculated server-side.**
14. **Order items store immutable purchase-time snapshots.**
15. **Multiple phones share one active table session.**
16. **The database remains the source of truth even when realtime
    updates are used.**
17. **Authentication and authorization are enforced server-side.**
18. **The MVP is designed for one branch and six tables, while avoiding
    unnecessary limitations in the data model.**

------------------------------------------------------------------------

## 24. Open Questions Before Implementation

The following items should be confirmed with the project stakeholders:

-   Exact staff roles and permissions.
-   Whether customers can cancel orders themselves and until which
    status.
-   Exact age-confirmation wording and legal requirements for puffs.
-   Whether taxes, service charges, discounts, or tips are required.
-   Whether payment processing is in scope for the MVP.
-   Whether customers can see all orders in the session or only orders
    created from their device.
-   Whether staff can reopen a closed session manually.
-   Whether QR tokens need rotation or revocation.
-   Whether menu images are public or require signed URLs.
-   Whether the system needs an audit log for admin changes.
-   Whether notifications beyond in-app realtime updates are required.
-   Whether the system will later support multiple branches.
-   Production backup, monitoring, and support expectations.
-   Exact Supabase and Vercel plan requirements before launch.

------------------------------------------------------------------------

## 25. Implementation Principle

The implementation should favor a simple, secure, maintainable
architecture:

-   Keep the Next.js application as the main application boundary.
-   Keep PostgreSQL as the authoritative source of structured data.
-   Use Realtime for updates, not as the source of truth.
-   Keep image binaries in R2.
-   Keep privileged operations on the server.
-   Validate every business-critical operation server-side.
-   Design the table-session model carefully because it connects QR
    access, multi-device ordering, order ownership, and billing.
