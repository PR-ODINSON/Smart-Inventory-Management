# Neelam Industries — Smart Inventory Management System

**Repo package name:** `aman`  
**Product:** Local-first inventory, production, and purchase-order management for **Neelam Industries** (foundry raw materials, Indian GST context).

Use this file as project context when working with ChatGPT or other AI assistants.

---

## What it does

- Track **materials**, **stock balances**, **locations**, **movements**, **suppliers**, and **production batches**
- Manage **purchase orders** (internal supplier POs and **customer POs** with dispatch/receive workflows)
- **Import customer POs from PDF** (pdf.js parsing, customer matching, validation)
- **Dashboard** and **reports** (Recharts)
- **Settings** including optional cloud backup

Demo/sample data is labeled **Demo Data** in the UI.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| UI | React 19, React Router 7, Tailwind CSS 4, Lucide icons |
| Build | Vite 8, TypeScript |
| Forms / validation | react-hook-form, Zod |
| Local data | **Dexie** → IndexedDB (`NeelamInventoryDB`) |
| Optional server | Express 5 + **MongoDB** (`server/index.mjs`) — full-app snapshot sync only |
| PDF | pdfjs-dist |
| Tests | Vitest (+ jsdom), oxlint |

---

## Architecture (important for changes)

1. **Default mode — local-first:** All reads/writes go through **services** into Dexie (`src/storage/database.ts`). No backend required for normal use.
2. **MongoDB (when `VITE_API_BASE_URL` is set):** On startup the app **pulls** cloud data if the local DB is empty. Local edits **debounce-push** to `PUT /api/state`, which stores the snapshot in `app_state` and **indexes** each entity into collections (`materials`, `suppliers`, `purchase_orders`, etc.) with MongoDB indexes. Auto demo seed is **skipped** when the cloud API is configured.
3. **Secrets:** `MONGODB_URI` and `PORT` are **server-only** (`.env`, never `VITE_*`). Browser uses `VITE_API_BASE_URL` (e.g. `/api` with Vite proxy in dev).

---

## Source layout

```
src/
  app/router.tsx          # All routes
  pages/                  # Route-level screens (Dashboard, Inventory, PO list/detail/edit/print, …)
  components/             # UI (layout/, po/, purchasing/, …)
  services/               # Dexie + business logic (purchaseOrderService, poWorkflowService, poImportService, …)
  storage/database.ts     # Dexie schema & tables
  types/                  # Domain types (inventory, purchasing, customer, production, settings)
  lib/                    # Pure helpers (po/, poImport/, parsePoPdf, …)
  features/purchasing/    # PO display/page utilities
  config/company.ts       # Company GSTIN and constants (buyer ≠ Neelam)
  tests/                  # Vitest unit tests (*.test.ts)
server/
  index.mjs               # /api/health, /api/state
```

**Purchase orders:** Status transitions live in `src/lib/po/poStatusMachine.ts`; workflow mutations in `src/services/poWorkflowService.ts`. Types in `src/types/purchasing.ts`.

**PDF import:** `src/lib/parsePoPdf.ts`, `src/lib/poImport/*`, `src/components/purchasing/PoPdfImportFlow.tsx`.

---

## Routes (high level)

| Path | Purpose |
|------|---------|
| `/` | Dashboard |
| `/inventory`, `/inventory/:id` | Materials list & detail |
| `/movements`, `/locations`, `/suppliers` | Operations master data |
| `/purchase-orders`, `/purchase-orders/:poId`, `…/edit` | PO list, detail, edit |
| `/purchase-orders/:poId/print` | Print view (outside shell) |
| `/production`, `/reports`, `/settings` | Production, reports, backup/settings |

---

## Commands

```bash
npm install
npm run dev          # Vite only (IndexedDB)
npm test             # Vitest
npm run build
npm run lint
```

Optional MongoDB sync:

```bash
cp .env.example .env   # set MONGODB_URI, etc.
npm run dev:full       # server + Vite (or npm run server + npm run dev)
```

---

## Conventions for contributors / AI

- Prefer **small, focused diffs**; match existing patterns in nearby files.
- Put **pure logic** in `src/lib/` or `src/features/`; **I/O and Dexie** in `src/services/`.
- Add or update **Vitest** tests in `src/tests/` for non-trivial logic (parsers, calculators, state machines).
- Do not expose Mongo credentials to the client bundle.
- Company GSTIN for Neelam is in `src/config/company.ts` — do not treat it as a customer GSTIN when parsing POs.
