# Business Rules

## Sales
- Vehicle selection should drive quantity defaults.
- Material selection should drive rate defaults.
- Cash, bank, and GPay are supported together.
- Remaining credit is derived from sale total minus payment breakdown.
- Vehicle trip count increases per sale.

## Credit Collections
- Party collections reduce outstanding balances.
- Collections can be split across cash, bank, and GPay.
- Collections must not exceed outstanding balance.

## Day Book
- Opening cash and bank balances are recorded per business day.
- Expenses are manual quarry office entries.
- Closing balances are derived from the day book data and sales projections.

## Reporting
- Reports must reuse stored business data and projections.
- Reports must not invent new accounting rules.

## Sync
- Offline data is authoritative.
- Cloud sync must not alter business history.
