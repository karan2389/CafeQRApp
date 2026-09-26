# Courista kitchen dashboard UI patch

This patch changes only the `/staff` dashboard and staff sign-in branding. It was prepared from the supplied `CafeQRApp-main` source and does not change customer pages, admin pages, database migrations, API routes, authentication checks, or payment behavior.

## Install

1. Extract the ZIP at your project root so the six files land at their included paths. Commit or back up any local edits to these paths first, and merge rather than overwrite if your copy has changed since the supplied source.
2. Install existing dependencies using the project's lockfile if required. No new package is needed.
3. Run `pnpm typecheck`, `pnpm lint`, and `pnpm build` (or the corresponding existing project commands).
4. Open `/staff` on a 1366 × 768 laptop and a wide monitor. Confirm the header, counts, and section headings remain visible while scrolling **inside** New, Preparing, Assistance, and Tables. On narrower screens, the section list can move vertically, but its contents still have bounded independent scroll areas.

## Scope and behavior

- `app/staff/(protected)/client-layout.tsx`: Courista header, staff identity/sign-out, light/dark toggle. The theme follows the device on first visit and then remembers that browser's choice in local storage.
- `app/staff/(protected)/page.tsx`: removes the large welcome card so work appears without page scrolling.
- `app/staff/(protected)/kitchen-dashboard.css`: styles and viewport-specific scroll boundaries scoped to the protected kitchen page.
- `components/staff/kitchen-dashboard-client.tsx`: compact orders, status filters, service requests, realtime/sound/refresh controls, and existing cancellation confirmation. Existing API calls, realtime subscription, sorting, update conflict handling and 10-second polling fallback stay in place.
- `components/staff/table-sessions-panel.tsx`: active table list with independent scroll, inactive tables disclosed on demand, and the existing final-bill/payment/unfinished-order warning modal.
- `app/staff/login/page.tsx`: sign-in title changed to Courista.

Active work opens by default. Delivered, Cancelled, and All change only the order pane. Active assistance and table billing remain alongside it. On desktop the body is held to the viewport; each queue and side panel scrolls separately. On small screens the header and workload controls remain above the section list.

## Manual service-flow check after integrating

1. Add a test order and request; check live arrival, sound opt-in, counters and visible notes.
2. Move an order New → Preparing → Delivered; check the correct queue and history.
3. Cancel a test order through its confirmation; check that its optional reason appears in history.
4. Acknowledge and resolve a test request; check it stays visible until resolved.
5. Open a table's bill dialog; check final bill, Cash/Card/UPI, the unfinished-order guard, and the close-session result. **Do not close a live guest session just to test UI.**
6. Switch light/dark, reload, and sign out. Check the same view on laptop and phone.

The archive contains no secrets or environment configuration. It is an integration patch, not a deployed update.
