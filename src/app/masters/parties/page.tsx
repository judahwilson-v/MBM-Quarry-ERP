"use client";

import { MasterDataPage, commonFormatters } from "@/components/modules/master-data-page";

export default function PartiesPage() {
  return (
    <MasterDataPage
      resource="parties"
      title="Parties"
      description="Customer master, GST details, ledger balance, statements, and soft deactivation."
      fields={[
        { name: "name", label: "Party name", required: true },
        { name: "address", label: "Address", type: "textarea" },
        { name: "phone", label: "Phone" },
        { name: "gstNumber", label: "GST Number" },
        { name: "currentBalance", label: "Current balance", type: "number", readOnly: true },
        { name: "isActive", label: "Active", type: "checkbox" },
      ]}
      columns={[
        { key: "name", label: "Party" },
        { key: "phone", label: "Phone" },
        { key: "gstNumber", label: "GST" },
        { key: "currentBalance", label: "Balance", format: commonFormatters.currency("currentBalance") },
      ]}
    />
  );
}
