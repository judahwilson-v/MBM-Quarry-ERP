# Phase 1.1A Execution Plan

This document is the execution checkpoint for the sales business-engine prep phase.

It is aligned to:

- [MBM_BUSINESS_SPEC.md](./MBM_BUSINESS_SPEC.md)
- [MBM_DATABASE_SPEC.md](./MBM_DATABASE_SPEC.md)
- [MBM_UI_SPEC.md](./MBM_UI_SPEC.md)
- [MBM_DECISIONS.md](./MBM_DECISIONS.md)
- [MBM_PHASES.md](./MBM_PHASES.md)
- [PHASE_1_1_SALES_DESIGN.md](./PHASE_1_1_SALES_DESIGN.md)

## Scope

### Included

- Sales business-engine preparation only.
- Business logic to support vehicle lookup, material lookup, quantity defaults, rate defaults, amount calculation, split payment calculation, remaining credit calculation, party credit update behavior, vehicle trip update behavior, and audit record preparation.
- Documentation and execution readiness only at this stage.

### Excluded

- Sales UI redesign.
- Purchases changes.
- Credit page redesign.
- Day Book implementation.
- Dashboard implementation.
- Auth implementation.
- Supabase sync.
- Electron packaging.
- Any unrelated refactor outside the sales flow.

## Files Expected to Change

- `src/lib/offline-actions.ts`
- `src/lib/prisma.ts` if the sales engine needs shared data-access helpers
- `src/components/modules/sales-entry-form.tsx` if form behavior must be adjusted to call the new engine
- `src/components/modules/sales-page.tsx` if list/edit integration needs to consume updated sales output
- `src/lib/sales-engine.ts`
- `prisma/schema.prisma` only if the sales engine requires schema fields already defined in the design
- `prisma/migrations/*` only if schema changes are actually required by the approved design
- `CHANGELOG.md` after implementation is complete

## Files That MUST NOT Change

- Purchases-related routes and modules
- Credit pages unrelated to the sales engine
- Dashboard code
- Electron-related code
- Supabase-related code
- Authentication code
- Non-sales UI layout and styling unless directly required by the sales engine

## Database Fields Affected

### Expected Existing Fields

- `outgoing_sales.vehicle_number`
- `outgoing_sales.party_name`
- `outgoing_sales.material_name`
- `outgoing_sales.rate_per_cft`
- `outgoing_sales.qty`
- `outgoing_sales.discount_type`
- `outgoing_sales.discount_value`
- `outgoing_sales.amount`
- `outgoing_sales.final_amount`
- `outgoing_sales.cash_paid`
- `outgoing_sales.bank_paid`
- `outgoing_sales.remarks`
- `outgoing_sales.vehicle_id`
- `outgoing_sales.party_id`
- `outgoing_sales.material_id`

### Expected Related Fields

- `vehicles.vehicle_number`
- `vehicles.party_id`
- `vehicles.company_body_qty`
- `vehicles.extra_body_qty`
- `party_credit.party_id`
- `party_credit.party_name`
- `party_credit.sale_id`
- `party_credit.amount`
- `party_credit.status`
- `audit_logs.entity_name`
- `audit_logs.entity_id`
- `audit_logs.action`
- `audit_logs.payload`

## Business Rules To Implement

- Vehicle selection should populate sale defaults when a match exists.
- Material selection should populate the rate default when a match exists.
- Quantity should default from vehicle capacity rules when available.
- Split payments must be supported across cash, bank, and GPay.
- Remaining balance after payment must become party credit.
- Overpayment must be rejected.
- Discount must not exceed the sale amount.
- Sales edit and delete actions must remain protected by password `1177`.
- Vehicle trip update behavior must stay consistent with the approved business spec.
- Audit records must be prepared for create, update, and delete events.

## Acceptance Criteria

- The execution plan stays aligned with the current business, database, UI, decision, and phase docs.
- The scope remains limited to sales business-engine preparation.
- All expected change files are listed explicitly.
- All out-of-scope areas are listed explicitly.
- The business rules are specific enough to implement without new architectural decisions.

## Definition Of Done

- `npm run build` still passes after implementation.
- Existing sales functionality still works.
- Vehicle auto-fill behavior is implemented where specified.
- Split payments work across cash, bank, and GPay.
- Remaining credit auto-calculates correctly.
- Existing data migrates correctly.
- No regression is introduced in Purchases.
- Documentation is updated to reflect the completed milestone.
- Relevant tests pass.

## Test Cases

- Create a sale with matched vehicle and material defaults.
- Create a sale with typed vehicle entry.
- Create a sale with cash-only payment.
- Create a sale with split cash, bank, and GPay payment.
- Create a sale with partial payment and remaining credit.
- Reject a sale with overpayment.
- Reject a sale with invalid discount values.
- Verify trip-count behavior for a committed sale.
- Verify audit preparation for sale create/update/delete flows.
- Verify existing non-sales routes still build and render.

## Rollback Considerations

- Keep the sales business-engine changes isolated to the sales path.
- Preserve legacy data fields until the workflow is fully verified.
- Prefer additive changes to schema and logic.
- If a sales-engine change fails validation, revert only the sales-engine commit rather than broader documentation or unrelated code.

## Risks And Dependencies

- The current sales flow already contains legacy assumptions that may need careful sequencing.
- Trip counting rules must be finalized before code is written.
- Audit behavior depends on how much mutation metadata the sales engine is allowed to capture now.
- Some downstream screens may depend on the sales output shape, so integrations must be checked before finalizing the engine.
- Database normalization must remain backward compatible with the existing SQLite data.
