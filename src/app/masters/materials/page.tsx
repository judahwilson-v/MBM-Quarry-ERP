"use client";

import { MasterDataPage, commonFormatters } from "@/components/modules/master-data-page";

export default function MaterialsPage() {
  return (
    <MasterDataPage
      resource="materials"
      title="Materials"
      description="Crusher materials, CFT rates, stock levels, reorder thresholds, and rate history."
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "code", label: "Code", required: true },
        { name: "unit", label: "Unit", type: "select", options: [{ value: "CFT", label: "CFT" }] },
        { name: "currentRate", label: "Current rate (₹/CFT)", type: "number" },
        { name: "currentStock", label: "Current stock", type: "number" },
        { name: "reorderLevel", label: "Reorder level", type: "number" },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "Material" },
        { key: "code", label: "Code" },
        { key: "currentRate", label: "Rate", format: commonFormatters.currency("currentRate") },
        { key: "currentStock", label: "Stock (CFT)" },
        { key: "reorderLevel", label: "Reorder (CFT)" },
      ]}
    />
  );
}
