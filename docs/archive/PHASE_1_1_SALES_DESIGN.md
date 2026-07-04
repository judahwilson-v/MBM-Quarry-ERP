# Phase 1.1 Sales Design Document

This document defines the intended sales rewrite before any code changes are made.

It is the implementation contract for Phase 1.1.

## Goals

- Rewrite sales business logic without redesigning the UI.
- Make the sales workflow business-correct and reviewable.
- Keep current routes and screen structure intact.
- Use normalized database references where possible.

## Complete Sales Workflow

### 1. Open Sales Entry

- User opens `/sales` or `/sales/new`.
- The form loads local vehicle and material masters.
- Default date is today.

### 2. Select or Type Vehicle

- User searches for a vehicle or types a new one.
- If matched vehicle exists:
  - vehicle number is filled
  - party name may be prefilled
  - quantity may be auto-filled from vehicle capacity rules
- If typed vehicle is new:
  - vehicle number is accepted
  - party name remains editable
  - vehicle may be created or linked according to the current master flow

### 3. Select Party

- Party should be derived from vehicle when available.
- User may override only if business rules allow it.
- Party must resolve to a party master record or be created through the existing master flow.

### 4. Select Material

- Material selection should auto-fill rate from material master.
- Manual override may be allowed if business rules permit.

### 5. Enter Quantity

- Quantity may auto-fill from vehicle capacity.
- User can adjust quantity if permitted by the workflow.
- Quantity must be validated as positive and non-zero.

### 6. Enter Payment

- Payment must support:
  - Cash
  - Bank
  - GPay
- All payment values must be non-negative.
- The total paid is the sum of the three payment methods.

### 7. Calculate Balance

- Sale amount is `qty × rate`.
- Any discount or business adjustment is applied before final total.
- Remaining amount after payments becomes party credit.
- If payments exceed final amount, the entry must be rejected.

### 8. Save Sale

- Sale is saved locally.
- Foreign-key fields are stored when available.
- Legacy text fields are preserved for compatibility during transition.
- Party credit row is updated from the final unpaid balance.
- Vehicle trip count is incremented if the workflow says this save represents a completed trip.
- Audit log is written for create/update/delete.

### 9. Edit Existing Sale

- Editing requires password `1177`.
- If password fails, edit is denied.
- If password succeeds, the record is loaded for mutation.
- Edits must re-run all validation and recalculation logic.

### 10. Delete Sale

- Deleting a sale requires password `1177`.
- Delete must remove or reverse related derived records safely.
- Audit log is written.

## UI Wireframe

### Sales Entry Form

1. Date
2. Vehicle lookup
3. Party name
4. Material lookup
5. Rate
6. Quantity
7. Cash paid
8. Bank paid
9. GPay paid
10. Discount type
11. Discount value
12. Remarks
13. Save button

### Supporting UI Behavior

- Show current calculated amount.
- Show paid total.
- Show remaining balance.
- Show inline validation errors.
- Keep edit/cancel controls in the existing header position.

## Database Changes Needed

### Existing Tables To Extend

- `outgoing_sales`
- `vehicles`
- `parties`
- `party_credit`
- `audit_logs`

### Required Sales Fields

- `vehicle_id`
- `party_id`
- `material_id`
- `cash_paid`
- `bank_paid`
- `gpay_paid`
- `payment_total`
- `remaining_amount`
- `trip_count_delta` or equivalent ledger marker if trip increments are tracked separately
- `updated_at`

### Notes

- Keep legacy text columns until all sales flows are migrated.
- Use normalized IDs for joins and future reporting.

## Validation Rules

- Date must be valid.
- Vehicle number is required.
- Party name is required.
- Material is required.
- Quantity must be greater than zero.
- Rate must be zero or greater.
- Payment fields must be non-negative.
- Total paid must not exceed final sale amount.
- Discount must not exceed amount.
- Edit/delete requests must pass the `1177` check.

## Business Rules

- Vehicle selection drives defaults.
- Material selection drives rate defaults.
- Quantity may be driven by vehicle capacity rules.
- Remaining balance becomes party credit.
- Sale credit must reflect the post-payment balance only.
- Vehicle trip counts should increase only when a trip-producing sale is committed.
- Audit records should capture important sale mutations.

## Audit Behaviour

- Create sale: log the new record summary.
- Update sale: log before and after values for important fields.
- Delete sale: log the deleted record summary and related derived changes.
- Audit should be lightweight in offline mode and prepared for richer metadata later.

## Vehicle Trip Update Flow

1. Vehicle is selected in the sale form.
2. Sale is saved successfully.
3. Trip count delta is computed from the business rule for the sale.
4. Vehicle trip total is incremented.
5. If sale is edited, the previous trip delta is reversed before applying the new one.
6. If sale is deleted, the trip delta is reversed.

## Party Credit Calculation

- `final amount = amount - discount`
- `total paid = cash + bank + GPay`
- `remaining amount = final amount - total paid`
- If remaining amount is positive:
  - create or update party credit for that remaining amount
- If remaining amount is zero:
  - no credit should be created
- If remaining amount is negative:
  - reject save

## Password 1177 Flow

### Edit

1. User clicks edit.
2. App asks for password `1177`.
3. If valid, edit mode opens.
4. If invalid, no data is exposed.

### Delete

1. User clicks delete.
2. App asks for password `1177`.
3. If valid, delete proceeds.
4. If invalid, delete is blocked.

## Error Scenarios

| Scenario | Expected Result |
| --- | --- |
| Missing vehicle | Block save with clear validation message |
| Missing party | Block save with clear validation message |
| Missing material | Block save with clear validation message |
| Quantity is zero | Block save |
| Rate is negative | Block save |
| Cash is negative | Block save |
| Bank is negative | Block save |
| GPay is negative | Block save |
| Total paid exceeds final amount | Block save |
| Discount exceeds amount | Block save |
| Invalid password | Block edit/delete |
| Vehicle lookup fails | Allow typed entry only if business rule permits |
| Material lookup fails | Block save or require explicit selection |

## Test Cases

### Workflow Tests

- Create sale with matched vehicle and material.
- Create sale with typed vehicle and auto-filled party.
- Create sale with cash-only payment.
- Create sale with split cash/bank/GPay payment.
- Create sale with partial payment and remaining party credit.
- Create sale with zero remaining amount.
- Edit sale with valid password.
- Reject edit with invalid password.
- Delete sale with valid password.
- Reject delete with invalid password.

### Calculation Tests

- Quantity × rate produces expected amount.
- Discount subtracts correctly.
- Partial payment computes remaining balance correctly.
- Overpayment is rejected.
- Vehicle trip delta is applied once per successful trip-producing save.

### Data Integrity Tests

- FK values are stored when available.
- Legacy text fields remain populated.
- Party credit updates when sale changes.
- Audit entries are written for mutations.

### Failure Tests

- Missing vehicle blocks save.
- Missing material blocks save.
- Invalid numeric input blocks save.
- Invalid password blocks edit/delete.
- Deleting a sale reverses derived state.
