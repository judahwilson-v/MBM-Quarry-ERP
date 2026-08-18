---
type: reference
last_updated: "2026-08-18"
---

# Domain Glossary

This document defines authoritative semantic terminology and mathematical invariants for all core business entities.

## Party
A customer or vendor who transacts with the quarry. Identified by `partyId` (UUID) and `partyName` (string). Parties accumulate credit through unpaid sales.

## PartyCredit
The outstanding balance owed by a party. Formula: `remainingCredit = finalAmount - paidTotal`. Reduced by PartyCollection records. Collections must not exceed outstanding balance. The party ledger (debit/credit/balance) is a running projection — never manually edited.

## Vehicle
A truck or transport vehicle registered for hauling material. Has `vehicleNumber` (plate number), `companyBodyQty` (standard capacity in CFT), `extraBodyQty` (extended capacity with side boards). Trip count increments by 1 (or `tripDelta`) per confirmed sale.

## Material
A quarry product (e.g., stone, aggregate). Has `materialName` and `ratePerCft` (price per cubic foot). Rate is the default for sales but is overridable with mandatory `rateReason` if changed.

## Sale (OutgoingSale)
A transaction where material is sold to a party via a vehicle. Key fields: `saleDate`, `serialNumber`, `bookNumber`, `pageNumber`, `qty` (CFT), `ratePerCft`, `finalAmount`. Payment supports split collection: Cash + Bank + GPay simultaneously. Formula: `paidTotal = cashPaid + bankPaid + gPayPaid`. Remaining unpaid becomes party credit: `remainingCredit = finalAmount - paidTotal`. GST (5%) splits into 2.5% SGST + 2.5% CGST.

## FinancialEvent
An immutable record of any monetary action. Created atomically within the same SQLite transaction as the business mutation. Has UUID, correlationId, schemaVersion, and JSON payload. Events are facts — never edited, only corrected by new events (SALE_CORRECTED, SALE_VOIDED).

## IncomingBoulder
A purchase of raw boulders from a supplier. Separate register from sales. Supports same split payment model. Default rock rate: ₹26/unit (overridable).

## DayBook
Daily accounting record. Opening balances (cash + bank) are recorded per business day. Closing balances derived from: opening + sales - expenses. Entries come from sales, expenses, and adjustments — never manual ledger edits.

## WeighbridgeTicket
A weighment record for material tracking. Has `ticketNumber` (sequential). On sync collision, remote tickets offset by +900000 to prevent duplicate crashes.

## LedgerEntry
A projection from FinancialEvent. Records cashAmount, bankAmount, gPayAmount, creditAmount, totalAmount. Disposable and rebuildable from events.

## Expense
A quarry operating expense. Has date, type, amount, payment mode, optional party/vehicle reference. Posts to Day Book automatically.

## EmployeeCredit
Tracks employee advances (loans from quarry to employee). Separate from party credit. Has expectedDueDate and status (pending/settled).
