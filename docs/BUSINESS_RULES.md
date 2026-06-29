# MBM Quarry ERP — Business Rules

This is the authoritative source for how the quarry operates. It overrides assumptions in code, README files, and prior AI output.

## Sales
- Vehicle selection drives quantity defaults from vehicle capacity rules. The default is editable.
- If the user changes the quantity from the vehicle default, a `quantityReason` is captured.
- Material selection drives rate defaults. Rate is editable.
- Payment supports split collection: **Cash**, **Bank**, and **GPay** simultaneously.
- Remaining unpaid amount becomes **party credit** automatically.
- Vehicle trip count increments by 1 (or `tripDelta`) per confirmed sale.
- Sales edits and deletes require password **1177**.
- All mutations are audit-logged.

## Boulder Purchases
- Separate register from sales — tracked as `IncomingBoulder`.
- Supports same split payment model (cash/bank/GPay).
- Rock rate defaults to ₹26 per unit but is overridable.
- Can include vehicle rent and combined payment flags.

## Party Credit
- Derived from sales: credit = `finalAmount – paidTotal`.
- Credit is reduced when a `PartyCollection` is recorded.
- Collections can be split across cash, bank, and GPay.
- Collections must not exceed the outstanding balance.
- Party ledger (debit/credit/balance) is a running projection — never manually edited.

## Employee Credit
- Tracks employee advances (loans from quarry to employee).
- Separate from party credit.
- Has `expectedDueDate` and `status` (pending / settled).

## Other Credit
- Miscellaneous receivables not tied to a party or employee.

## Expenses
- Each expense has: date, type, amount, payment mode, optional party/vehicle reference.
- Expenses post to the Day Book automatically.

## Day Book
- Opening balances (cash + bank) are recorded per business day.
- Closing balances are derived from opening balances + sales – expenses.
- Day Book entries come from sales, expenses, and adjustments — not manual ledger edits.

## Reporting
- Reports reuse stored business data and projections.
- Reports must never invent new accounting rules.
- GST summary is derived from `gstEnabled` sales only.

## Sync
- Offline SQLite data is authoritative at all times.
- Cloud sync (Supabase) must never alter business history.
- Sync is an append-only push of events to the cloud.

## Edit Password Policy
- Password `1177` protects all edit and delete operations on Sales.
- This remains in force until full authentication replaces it.

## Derived Fields Policy
- If a derived value is stored (e.g., `finalAmount`, `paidTotal`), its source fields and formula are documented.
- Stored derived fields are **convenience caches**, not authoritative inputs.
- Direct editing of derived fields is never allowed.
- Cached fields must be recalculated whenever their source fields change.
