"use client";

import { MasterDataPage } from "@/components/modules/master-data-page";

export default function VehiclesPage() {
  return (
    <MasterDataPage
      resource="vehicles"
      title="Vehicles"
      description="Truck registrations, owners, party association, capacity, and default dispatch quantity."
      fields={[
        { name: "vehicleNumber", label: "Vehicle number", required: true },
        { name: "ownerName", label: "Owner name" },
        { name: "companyBody", label: "Company body", type: "checkbox" },
        { name: "extraBody", label: "Extra body", type: "checkbox" },
        { name: "isPickup", label: "Pickup truck", type: "checkbox" },
        { name: "bodyRemarks", label: "Body remarks", type: "textarea" },
        { name: "partyId", label: "Associated party", type: "select" },
        { name: "capacity", label: "Max capacity (CFT)", type: "number" },
        { name: "defaultQty", label: "Default quantity (CFT)", type: "number" },
        { name: "remarks", label: "Remarks", type: "textarea" },
      ]}
      columns={[
        { key: "vehicleNumber", label: "Vehicle" },
        { key: "ownerName", label: "Owner" },
        { key: "party.name", label: "Party" },
        { key: "companyBody", label: "Company Body", format: (row) => (row.companyBody ? "Yes" : "No") },
        { key: "extraBody", label: "Extra Body", format: (row) => (row.extraBody ? "Yes" : "No") },
        { key: "isPickup", label: "Pickup", format: (row) => (row.isPickup ? "Yes" : "No") },
        { key: "defaultQty", label: "Default Qty (CFT)" },
      ]}
    />
  );
}
