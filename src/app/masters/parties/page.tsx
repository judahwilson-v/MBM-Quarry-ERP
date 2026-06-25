"use client";

import { MasterDataPage } from "@/components/modules/master-data-page";

export default function PartiesPage() {
  return (
    <MasterDataPage
      resource="parties"
      title="Parties"
      description="Customers and buyer groups."
      fields={[
        { name: "partyName", label: "Party name", required: true },
        { name: "phone", label: "Phone" },
        { name: "address", label: "Address", type: "textarea" },
      ]}
      columns={[
        { key: "partyName", label: "Party" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
      ]}
    />
  );
}
