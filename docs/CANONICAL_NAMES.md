# MBM Canonical Naming Conventions

> **Source of Truth for AI Agents & Developers**  
> All codebase modifications must adhere strictly to these canonical names. Do not invent alternative names or field variations.

---

## 1. Core Rule: One Concept = One Name

- **Database (SQL & Supabase)** uses `snake_case`.
- **TypeScript & Prisma Models** use `camelCase` mapped via Prisma `@map(...)`.
- **API Payload & Component Props** must match Prisma `camelCase` names unless interfacing directly with raw SQL or REST endpoints.

---

## 2. Canonical Fields Reference

### Payment & Collection Fields
| Canonical Concept | Prisma / TS Field | Database (SQL) Column | Approved Aliases | Prohibited Variations |
| :--- | :--- | :--- | :--- | :--- |
| Cash Paid | `cashPaid` | `cash_paid` | Cash | `cash_payment`, `paidCash` |
| Bank Paid | `bankPaid` | `bank_paid` | Bank Transfer | `bank_payment`, `paidBank` |
| GPay Paid | `gPayPaid` | `gpay_paid` | Google Pay | `gpay`, `gPay`, `g_pay_paid` |
| Total Paid | `paidTotal` | `paid_total` | Total Received | `total_paid`, `amountPaid` |
| Remaining Credit | `remainingCredit` | `remaining_credit` | Outstanding | `credit_remaining`, `dueAmount` |

---

### Entity Identifiers & Names
| Entity | Prisma / TS ID | Prisma / TS Name | DB ID Column | DB Name Column | Prohibited Variations |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Vehicle | `vehicleId` | `vehicleNumber` | `vehicle_id` | `vehicle_number` | `veh_id`, `reg_no`, `v_num` |
| Party (Customer/Vendor)| `partyId` | `partyName` | `party_id` | `party_name` | `customer_id`, `client_name` |
| Material | `materialId` | `materialName` | `material_id` | `material_name` | `item_id`, `product_name` |

---

### Transaction & Sales Fields
| Canonical Concept | Prisma / TS Field | Database Column | Notes |
| :--- | :--- | :--- | :--- |
| Sale Date | `saleDate` | `sale_date` | Primary transaction timestamp |
| Serial Number | `serialNumber` | `serial_number` | Slip / Invoice serial |
| Book Number | `bookNumber` | `book_number` | Manual register book # |
| Page Number | `pageNumber` | `page_number` | Manual register page # |
| Quantity (CFT) | `qty` | `qty` | Measured volume in CFT |
| Rate per CFT | `ratePerCft` | `rate_per_cft` | Unit price per CFT |
| Final Amount | `finalAmount` | `final_amount` | Post-tax & discount total |

---

## 3. Strict AI Rules

1. **Never invent new field names**: Verify all property names against this document and `prisma/schema.prisma`.
2. **Never break snake_case / camelCase parity**: Ensure `@map("snake_case")` is preserved in Prisma schemas.
3. **If a field is missing**: Stop and clarify before introducing new domain fields.
