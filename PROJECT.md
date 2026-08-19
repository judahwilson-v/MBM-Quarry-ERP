# Project: MBM Quarry ERP & Mobile Owner Dashboard

## Architecture
- **Desktop ERP (`MBM1`)**: Electron shell + Next.js 14 App Router + SQLite (%APPDATA%/quarry.db) + Prisma ORM + Outbox CDC Pattern (`audit_logs`) + AutoSync Engine.
- **Cloud Central Database**: Supabase PostgreSQL 15+ (30 tables, B-Tree indexes, `updated_at` triggers, RLS `authenticated_sync_access`, stored RPCs).
- **Mobile Owner Dashboard (`mbm-dashboard`)**: Standalone Next.js 16.3.0 + React 19.2.8 + Tailwind CSS v4 + `@supabase/ssr` (Pure React Server Components, Read-Only, Glassmorphism mobile UI).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|:---:|---|---|:---:|---|
| 1 | Daily Gross & Net Revenue | Live summation of gross and net sales dispatches for business day | Executive KPIs | `OWNER_DASHBOARD_PRD.md` |
| 2 | Real-Time Monthly P&L | Real-time net operating margin (Sales minus Purchases and Expenses) | Executive KPIs | `FINANCIAL_EVENT_ARCHITECTURE.md` |
| 3 | Cash & Bank Liquidity Position | Snapshot of physical cash in quarry register and commercial bank | Executive KPIs | `07_OWNER_DASHBOARD_GUIDE.md` |
| 4 | Net Receivables vs Payables | Total outstanding credit owed by customers vs owed to suppliers | Executive KPIs | `DATABASE_MAP.md` |
| 5 | Quarry Health Index (QHI) | Multi-factor operational health score (Sync, trips, liquidity, credit) | Executive KPIs | Domain synthesis |
| 6 | Live Dispatch Trip Feed | Chronological, real-time scrolling stream of dispatched trucks | Operations | `sales-page.tsx` |
| 7 | Material Dispatch Mix | Donut chart & volume/revenue breakdown by aggregate grade | Operations | `QUARRY_FIELD_NOTES.md` |
| 8 | Truck Turnaround & Velocity | Duration between gross and tare weighment & trips per truck | Operations | `DATABASE_MAP.md` |
| 9 | Digital Weighbridge Audit | Gross/tare/net weighment validation against sales slip volume | Operations | `IDEAS.md` |
| 10 | Rate & Qty Override Audit | Audit highlighting dispatches with custom rate/capacity overrides | Operations | `BUSINESS_RULES.md` |
| 11 | Customer/Vendor Directory | Searchable directory of buyers, truck owners, and boulder vendors | Party 360 | `DATABASE_MAP.md` |
| 12 | Running Ledger Timeline | Chronological reconstructable transaction ledger with running balance | Party 360 | `glossary.md` |
| 13 | Payment & Collection Tracking | 3-way split payment tracking (Cash, Bank NEFT, GPay UPI) | Party 360 | `BUSINESS_RULES.md` |
| 14 | Credit Aging Analysis | Aging buckets (<30d, 31-60d, 61-90d, >90d) and credit lock alerts | Party 360 | `IDEAS.md` |
| 15 | Diesel & Generator Burn | Fuel consumption tracking (Vehicle tanks vs 240 KVA generator cans) | Expenses & Fuel | `QUARRY_FIELD_NOTES.md` |
| 16 | Preventative Maintenance Alerts | Engine hour threshold tracking for greasing, oil, and overhaul | Expenses & Fuel | `prisma/schema.prisma` |
| 17 | Labor Advances & Payroll | Worker loan tracking, salary advances, and running employee balance | Expenses & Fuel | `QUARRY_FIELD_NOTES.md` |
| 18 | Quarry Overheads & Utilities | Recurring operational costs (Electricity ~₹1.3L, Explosives, Spares) | Expenses & Fuel | `QUARRY_FIELD_NOTES.md` |
| 19 | Live Sync Freshness Pill | Real-time status pill (Green `<1h`, Amber `1-4h`, Red `>4h`) | Sync Telemetry | `OWNER_DASHBOARD_PRD.md` |
| 20 | Unsynced Queue Inspector | Diagnostic view of pending push items, held FK 23503 logs | Sync Telemetry | `sync-diagnostics.ts` |
| 21 | Schema Parity Guard | Verification that cloud PostgreSQL schema matches desktop SQLite | Sync Telemetry | `AI_INDEX.md` |
| 22 | GST vs Non-Tax Turnover | Segregation of GST-enabled sales (5%) vs non-tax dispatches | Tax & Compliance | `BUSINESS_RULES.md` |
| 23 | Licences & Permit Tracker | Expiry date countdowns for Pollution, Panchayat, and Geology | Compliance | `QUARRY_FIELD_NOTES.md` |
| 24 | Mobile Statement Exporter | One-tap PDF/CSV statement generation for WhatsApp sharing | Data Portability | `OWNER_DASHBOARD_PRD.md` |

## Milestones
| # | Name | Scope | Dependencies | Status |
|:---:|---|---|---|:---:|
| 1 | Architecture & Sync Survey | Complete survey of Desktop ERP, Outbox CDC, and Sync Pipeline | none | DONE |
| 2 | Cloud DB & Dashboard Survey | Complete survey of Supabase Schema, RLS, and RSC Mobile Dashboard | none | DONE |
| 3 | Domain & Feature UI Mapping | Complete mapping of 32 tables & >240 fields to mobile UI widgets | none | DONE |
| 4 | Master Synthesis & Specification | Comprehensive architectural report and feature catalog | M1, M2, M3 | DONE |
| 5 | Independent Review & Forensic Audit | Verification of completeness and zero repository code modification | M4 | IN_PROGRESS |

## Interface Contracts
### Desktop ERP (`MBM1`) <-> Cloud Supabase (`PostgreSQL`)
- Protocol: HTTPS / PostgREST REST API
- Payload format: JSON (transformed from camelCase to snake_case via `sync-map.json`)
- Push endpoints: `POST /rest/v1/{table}?on_conflict=id`
- Pull endpoints: `GET /rest/v1/{table}?select=*&updated_at=gt.{last_synced_at}`
- Error handling: PostgreSQL error `23503` (FK violation) triggers 3-pass holding queue; `23505` (unique collision) triggers merge suffix renaming.

### Cloud Supabase (`PostgreSQL`) <-> Mobile Owner Dashboard (`mbm-dashboard`)
- Protocol: Pure React Server Components (RSC) executing server-side PostgREST queries via `@supabase/ssr`
- Mode: Strict Read-Only (`SELECT` only, zero client mutation handlers)
- Caching: Edge cache revalidation on focus/reconnect, 30s background polling, Realtime Postgres Changes subscriptions.
