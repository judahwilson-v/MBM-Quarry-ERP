"use client";

import { MasterDataPage } from "@/components/modules/master-data-page";

const PARTY_GROUPS = ["BUYER", "TRUCK_OWNER", "BOULDER_SUPPLIER", "WORKER", "PUMP"];

export default function PartiesPage() {
  return (
    <MasterDataPage
      resource="parties"
      title="Parties"
      description="Customers, truck owners, suppliers, and worker accounts."
      fields={[
        { name: "partyName", label: "Party name", required: true },
        { name: "partyGroup", label: "Group", type: "select", options: PARTY_GROUPS },
        { name: "phone", label: "Phone" },
        { name: "address", label: "Address", type: "textarea" },
      ]}
      columns={[
        { key: "partyName", label: "Party" },
        { key: "partyGroup", label: "Group" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
      ]}
    />
  );
}
