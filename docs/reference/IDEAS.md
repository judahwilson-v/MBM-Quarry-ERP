# MBM Quarry ERP — Ideas Inbox

Use this file to capture unconfirmed feature ideas, rough thoughts, and speculative notes.

**Do not promote entries here to ROADMAP without explicit user approval.**

---

## Multi-Project Grand Roadmap
- **Project 1 (Active/Current)**: MBM Quarry ERP (Offline-first Electron + Next.js + SQLite Desktop Application). *This project is actively in development with a long way to go.*
- **Project 2 (Next Project)**: MBM Owner Web Dashboard (Separate standalone Web App on Vercel + Supabase, starts only after Project 1 is fully complete). PRD in `docs/reference/OWNER_DASHBOARD_PRD.md`.
- **Project 3 (Future Project)**: MBM Mobile Companion App (Separate Mobile App for Owner, starts only after Project 2 is fully complete).

---

## 1. Potential Future Roadmap (ERP Phases)
*Note: This roadmap applies to Project 1 (MBM Quarry ERP) and builds upon the current foundation.*

### Phase 14 — Field Testing & Bug Fixes (Current)
- Fix all 12 items from the personal observation file
- Deploy to quarry workstation
- Collect real-world feedback for 2-4 weeks

### Phase 15 — Polish & Quick Wins
- Vehicle body type selector
- Keyboard shortcuts for common actions

### Phase 16 — Business Intelligence
- Top 10 parties by revenue/credit
- Material-wise sales breakdown
- Vehicle utilization reports
- Automated daily summary reports

### Phase 17 — Customer & Communication
- Activate `enable_customer_portal` — web portal for customers to check credit
- SMS/WhatsApp receipt notifications
- Credit reminder automation
- Receipt photo attachment

### Phase 18 — Compliance & Government
- E-Way Bill integration
- Royalty payment tracking
- Mining permit expiry alerts
- Enhanced GST reporting with GSTR-1 format export

### Phase 19 — Advanced Operations
- Activate `enable_weighbridge` — digital weighbridge integration
- Crusher production tracking (input → output efficiency)
- Quality control / sieve analysis records
- Multi-site support

---

## 2. Industry Feature Suggestions (Large Quarry Operations)
*Ideas based on how large-scale quarry and mining operations manage their ERP systems.*

| Feature | What It Does | Why Big Quarries Use It | Complexity for MBM |
| :--- | :--- | :--- | :--- |
| **GPS Fleet Tracking** | Real-time vehicle location on a map | Prevents unauthorized trips, calculates fuel efficiency per route | Very High (needs hardware + API integration) |
| **Weighbridge Auto-Capture** | Digital weighbridge directly feeds weight data | Eliminates manual entry errors, speeds up loading/unloading | High (hardware integration) |
| **Royalty & Mining Permit Tracking** | Tracks government permits, royalty payments per ton, and expiry dates | Legal compliance — quarries can be shut down for permit violations | Medium |
| **Multi-Quarry / Multi-Site** | Single ERP managing multiple quarry locations | Large firms operate 5-20 quarry sites from a central office | High (needs multi-tenant data isolation) |
| **Customer Portal (Self-Service)** | Customers check their credit balance, order history, and make payments online | Reduces phone calls and disputes | Medium (have `enable_customer_portal` flag) |
| **E-Way Bill Integration** | Auto-generates GST e-way bills for interstate material transport | Legal requirement for goods > ₹50,000 crossing state borders | Medium |
| **SMS/WhatsApp Notifications** | Sends transaction receipts, credit reminders, and payment confirmations | Reduces disputes, improves collections | Low-Medium |
| **Crusher & Plant Production Tracking** | Tracks raw boulder input → crushed output per material type | Calculates production efficiency and wastage rates | Medium |
| **Quality Control / Sieve Analysis** | Records material grading test results per batch | Required for government contracts and large construction projects | Medium |
| **Purchase Order & Quotation System**| Formal PO workflow with approval chains | Standard in large operations; enables bulk pricing and contract management | High |

---

## 3. Features from Other ERP/Accounting Apps
*Ideas inspired by existing software solutions.*

| Feature | Inspired By | What It Does | Value for MBM |
| :--- | :--- | :--- | :--- |
| **Receipt Photo Capture** | Zoho Books, Khatabook | Snap a photo of a physical receipt/challan and attach it to a transaction | High — physical proof for disputes |
| **Voice Entry** | Vyapar App | Speak the vehicle number, party name, and qty instead of typing | Medium — useful for dusty quarry environments |
| **Recurring Expenses** | Tally Prime, QuickBooks | Auto-create monthly recurring expenses (rent, salary, insurance) | Medium — saves repetitive data entry |
| **Multi-Currency Support** | SAP, Oracle NetSuite | Handle payments in different currencies | Low priority for domestic quarries |
| **Barcode/QR on Receipts** | Modern POS systems | Print a QR code on each receipt that links to the digital record | Low — adds professionalism and easy lookup |
| **Credit Limit Enforcement** | Tally Prime | Block new sales to a party when their credit exceeds a defined limit | Low (have `enable_credit_locks` flag) |
| **Automated Daily Reports** | ERPNext, Zoho | End-of-day summary sent to the owner automatically via Email/WhatsApp | Medium — owner gets updates without opening the app |
| **Offline Map View** | Mining-specific ERPs | Shows quarry site layout, vehicle positions, stockpile locations | High — needs map integration |
| **Employee Attendance & Wage Calc** | Khatabook, ERPNext | Track daily attendance and auto-calculate wages | Medium |

---

## 4. UI/UX Patterns from Premium Apps

| Pattern | Inspired By | What It Does |
| :--- | :--- | :--- |
| **Keyboard shortcuts** | Notion, Linear | Ctrl+N new sale, Ctrl+S save, Esc cancel, arrow keys to navigate table |
| **Command Palette** | VS Code, Linear | Ctrl+K to search anything: sales, parties, vehicles, settings |
| **Inline table editing** | Airtable, Google Sheets | Click a cell in the sales table to edit it directly without opening a form |
| **Drag-to-reorder columns** | Airtable | Users customize their own table column order |
| **Bulk actions** | Gmail, Notion | Select multiple rows → Delete All / Export Selected / Mark as Paid |
| **Toast notifications** | Modern web apps | Non-intrusive success/error messages that auto-dismiss |
| **Skeleton loading states** | Modern web apps | Show grey placeholder shapes while data loads instead of a blank page |
| **Confetti on milestones** | Duolingo, Stripe | Fun animation when daily revenue crosses a target (morale booster) |

---

## 5. Existing Repository Ideas (Legacy / Inbox)

### 2026-06-27 — Auto-Updater via GitHub Releases
- Summary: Use `electron-updater` to automatically push application updates to the quarry PC.
- Why it matters: Removes the manual "copy new .exe" workflow.
- Status: discussed — approved in principle, deferred until RC1 is validated at quarry (see D-011).

### 2026-06-27 — Tally Integration (Phase 7) 
- Summary: Generate Tally-compatible XML/CSV exports from sales data for GST filing.
- Why it matters: Quarry accountant uses Tally ERP 9 / Tally Prime.
- Status: completed — Phase 7 is BUILT (`src/app/tally/`, `src/lib/domain/tally/`).

### 2026-08-05 — IoT Weighbridge Integration
- Summary: Direct RS-232/Ethernet integration with physical weighbridge indicators.
- Why it matters: Prevents manual entry errors and speeds up the ticketing process.
- Status: paused — put on hold per user request (Mapped to Phase 19).

### 2026-06-27 — Prompt-based Idea Capture
- Summary: Allow the user to paste an idea in chat and have the AI store it in this inbox automatically.
- Why it matters: Keeps unconfirmed chat ideas out of the roadmap until explicitly approved.
- Status: approved.

### 2026-06-27 — Future Phase Planning Notes
- Summary: Use this file as the official repository inbox for phase suggestions that are not yet committed.
- Why it matters: Prevents speculative feature ideas from mixing with approved phase implementation plans.
- Status: approved.

---
> [!CAUTION]
> Reminder: This document is strictly for analysis and planning. No code has been written, no files have been modified, no automated tasks have been triggered based on these ideas.
