# Architecture Alignment and Codebase Structure Report

## 1. Context & Purpose
This document provides a comprehensive mapping of the **Cafe QR Ordering System** codebase against the architectural vision set forth in `architecture.md`.

The primary goal of this optimization was to transition the initial working prototype into a clean, maintainable, modular, and domain-oriented architecture without altering any user-facing or operational behavior.

---

## 2. Before & After Codebase Structure

### Before Optimization
```text
Cafe_QR_Ordering_Demo/
├── app/
│   ├── components/
│   │   └── demo-webmcp.tsx
│   ├── kitchen/
│   │   └── page.tsx              (315 lines: monolithic floor overview, sound alerts, order cards, state changes)
│   ├── table/
│   │   └── [slug]/
│   │       └── page.tsx          (413 lines: monolithic menu browsing, cart, age gate, order review, bill)
│   ├── chatgpt-auth.ts           (unreferenced boilerplate)
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx                  (landing page)
│   └── lib/
│       ├── demo-data.ts          (hardcoded menu and seed data)
│       ├── demo-store.ts         (localStorage + BroadcastChannel sync, formatting)
│       ├── types.ts              (mixed domain, order, state, and event types)
│       └── use-demo-state.ts     (state subscription hook)
├── components/
│   └── ui/                       (61 shadcn UI components)
├── db/                           (D1 boilerplate)
├── hooks/
│   └── use-mobile.ts
├── lib/
│   └── utils.ts
├── public/
├── architecture.md
└── package.json
```

### After Optimization
```text
Cafe_QR_Ordering_Demo/
├── app/
│   ├── components/
│   │   └── demo-webmcp.tsx
│   ├── kitchen/
│   │   └── page.tsx              (Modular kitchen dashboard page assembling components & sound features)
│   ├── table/
│   │   └── [slug]/
│   │       └── page.tsx          (Modular customer ordering page assembling components & cart features)
│   ├── globals.css
│   ├── layout.tsx
│   ├── page.tsx
│   └── lib/                      (Backward-compatibility adapters re-exporting from domain modules)
│       ├── types.ts              (Re-exports from @/types)
│       ├── demo-data.ts
│       ├── demo-store.ts         (Uses centralized @/lib/constants & @/lib/format)
│       └── use-demo-state.ts
├── components/
│   ├── customer/                 (Extracted customer-facing domain components)
│   │   ├── customer-header.tsx   (Header with branding, table badge & staff call button)
│   │   ├── product-card.tsx      (Menu item card, image, availability tag & quantity controls)
│   │   ├── order-items.tsx       (Line-item renderer partitioned by Main Menu vs Puffs)
│   │   ├── running-bill.tsx      (Session running bill, historical orders & status badges)
│   │   ├── age-gate-dialog.tsx   (18+ age verification modal for Puffs)
│   │   └── order-review-dialog.tsx (Order summary modal with customer name & kitchen note)
│   ├── kitchen/                  (Extracted kitchen staff domain components)
│   │   ├── kitchen-header.tsx    (Dashboard header with audio alert toggle & reset action)
│   │   ├── kitchen-table-card.tsx(Interactive floor card with computed visual state & elapsed timers)
│   │   ├── kitchen-order-card.tsx(Order card with line items, note, and status progression)
│   │   ├── kitchen-table-detail.tsx (Sidebar panel with bill summary, staff alert, orders & table close)
│   │   └── reset-demo-dialog.tsx (Confirmation modal for resetting demo data)
│   └── ui/                       (Reusable design system components)
├── features/                     (Domain-specific business logic and custom hooks)
│   ├── ordering/
│   │   ├── use-cart.ts           (Cart management, localStorage sync, quantity validation)
│   │   └── order-lifecycle.ts    (Order status transition rules, styles, and labels)
│   ├── service-calls/
│   │   └── use-staff-call.ts     (Staff call submission, pending status, cooldown management)
│   └── kitchen/
│       ├── kitchen-status.ts     (Visual floor state machine and metadata mapping)
│       └── kitchen-sound.ts      (Web Audio API synthesizer chords for orders and staff calls)
├── types/                        (Isolated, modular domain types)
│   ├── menu.ts                   (MenuItem, MenuSection, MenuCategory)
│   ├── orders.ts                 (OrderStatus, OrderLine, DemoOrder, CreateOrderInput)
│   ├── tables.ts                 (TableStatus, DemoTable, TableSessionContext)
│   ├── service-calls.ts          (StaffCallStatus, StaffCall)
│   ├── demo-state.ts             (DemoState, DemoEvent)
│   └── index.ts                  (Unified export barrel)
├── schemas/                      (Runtime validation with Zod)
│   ├── orders.ts                 (OrderLine schema, CreateOrder schema)
│   ├── tables.ts                 (TableStatus schema, slug validation)
│   ├── service-calls.ts          (StaffCall schemas)
│   └── index.ts                  (Unified export barrel)
├── lib/
│   ├── config/
│   │   └── env.ts                (Type-safe environment configuration)
│   ├── constants.ts              (Storage keys, channel names, operational limits)
│   ├── format.ts                 (formatINR, elapsed time, formatTime)
│   ├── r2/
│   │   └── index.ts              (Cloudflare R2 image resolver with local fallback)
│   ├── supabase/
│   │   └── client.ts             (Supabase client stub & readiness detection)
│   └── utils.ts                  (cn utility)
├── docs/
│   ├── architecture-alignment.md (This document)
│   └── production-readiness.md   (Gap analysis and backend roadmap)
├── .env.example                  (Production environment variables template)
├── architecture.md
└── package.json
```

---

## 3. Preservation of Existing Demo Functionality

Every user flow, UI layout, visual style, and state behavior was carefully verified:
1. **Zero Route Disruption**: Both `/table/[slug]` and `/kitchen` maintain identical route params, URLs, and behaviors.
2. **State & BroadcastChannel Compatibility**: The internal format of `DemoState` and `DemoEvent` remains identical, ensuring cross-tab communication functions seamlessly.
3. **Cart & LocalStorage Stability**: Cart items remain scoped to `ember-oak-cart-${slug}` and reload on refresh.
4. **SessionStorage Flags**: Puffs 18+ verification (`ember-oak-puffs-confirmed`) and Kitchen sound alert setting (`ember-oak-sound-enabled`) are fully maintained.
5. **WebMCP Registration**: Browser AI tools (`read_cafe_demo_state`, `reset_cafe_demo_data`) remain registered in `DemoWebMcp`.
6. **Backward Compatible Imports**: Files under `app/lib/types.ts` and `app/lib/demo-store.ts` re-export all types and methods so existing consumers never fail.
