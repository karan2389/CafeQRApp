# Cafe QR Ordering Demo

Client-ready interactive demo for the customer ordering flow and six-table kitchen dashboard.

## Run locally

```bash
pnpm install
pnpm dev
```

Open:

- Customer: `http://localhost:3000/table/demo-table-1`
- Kitchen: `http://localhost:3000/kitchen`

Open both routes in separate tabs in the same browser. Demo data is stored locally in the browser and synchronized between tabs with `BroadcastChannel`.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm build
```

This demo uses no external services, credentials, authentication, online payments or production integrations.
