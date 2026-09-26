# Courista customer UI patch — Antigravity instructions

## Base and scope

Apply to the source archive **CafeQRApp-main (1).zip** supplied on 27 Sep 2026. Its SHA-256 is `da85b4d7160dc29e87a628902e47ad568ab85fd3234b9a7a4298f38ea43873de`. If your deployed branch has moved on, compare and merge the files manually; do not overwrite newer order/session logic.

`project-files/` is a partial overlay rooted at the Next.js project root. Copy the directories inside it into the project root, preserving paths. It updates **only** `components/customer/`, `app/table/[slug]/`, and adds `public/courista/`. It does not replace the complete repo, change dependencies, schema, Supabase, APIs, QR route, middleware, Admin, or Staff. `references/` is visual guidance and should not be copied into the deployed app.

## Visual target

Use the clean Allerta-led Courista design selected by the owner (`references/selected-customer-home.png`). The home screen has Courista branding, a photo hero, actual category labels from live menu data, compact food rows, large add/quantity controls, staff shortcut and sticky mobile cart. Order status and running bill remain driven by existing live data. See `references/loading-frame-*.png` for animation sequence C → Cour → Courista/tagline → menu reveal.

The coffee/food photos and prices in the mockup are *illustrative*. The implementation reads real menu items, descriptions, categories, availability, images and prices from the existing data source. It does not hard-code mockup prices. The included hero is a generated composite inspired by the owner's Courista venue photos; inspect its signage/cup details and replace it with an approved real photograph if exact fidelity is required. The wordmark is styled live text; provide a licensed official vector/brand font later if pixel-identical brand typography is required. The customer font loads Allerta from Google Fonts with local sans fallback.

## Merge steps

1. Back up the working branch and inspect the diff for any newer edits in these paths.
2. Overlay `project-files/` into the project root. Preserve the current `app/qr/route.ts`, `app/table/[slug]/page.tsx`, API routes, and server auth checks.
3. Install with the existing lockfile (`pnpm install --frozen-lockfile`); no package changes are needed.
4. Run `pnpm typecheck`, `pnpm build`, and ESLint on the changed customer components. The base repo's `pnpm test` calls `npx tsx` but `tsx` is not in its package manifest; add it to the development environment or use a transient runner to execute `scripts/verify-fallback.ts`.
5. Preview a valid QR scan in mobile Safari and Android Chrome. Check 320, 360, 375, 390, 430px widths; landscape; iPhone safe-area bottom; tablet; desktop. Check the on-screen keyboard with name/note inputs. The real QR token and active table session are required in production; opening `/table/table-1` directly is invalid by design.
6. Test All/category filtering, unavailable product, add/remove/quantity cap, persistent cart, order review and confirmation, new/preparing/delivered/cancelled status, running bill, staff/water/bill/assistance requests, 18+ Puffs gate, closed-session behavior, and re-scan. No request or live order should be sent while performing passive visual review.

## QR loading behavior

`app/table/[slug]/loading.tsx` shows the Courista wordmark while the server resolves that route; the client intro remains until initial menu data and local state are ready, with about 1.1 seconds of animation on regular-motion devices and immediate reveal for reduced motion. The server-side `/qr` validation and redirect remain untouched. Browser time spent on `/qr` before the redirect cannot display this route's React animation. Avoid changing QR security just to extend the splash.

## Known environment and content notes

- The implementation passed `pnpm typecheck`, targeted customer ESLint (one pre-existing `clearCart` effect dependency warning), and `pnpm build` in the provided source. Local fallback/cart math verification passed via a transient tsx loader. A local HTTP smoke test could not run in the execution environment because Node's network interface lookup returned `ERR_SYSTEM_ERROR`; check in Antigravity's preview environment.
- The logo's serif look is approximated in CSS. The synthetic hero composite is a proposed visual asset, not a documentary photo. Menu product images are controlled by existing Admin data and should be checked for accuracy before go-live.
- The 18+ confirmation is the existing session-scoped interaction. This patch does not alter enforcement or add new backend rules.
