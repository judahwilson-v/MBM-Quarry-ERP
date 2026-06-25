"use client";

import { MasterDataPage } from "@/components/modules/master-data-page";

export default function VehiclesPage() {
  return (
    <MasterDataPage
      resource="vehicles"
      title="Vehicles"
      description="Truck numbers and default loading capacities (CFT)."
      fields={[
        { name: "vehicleNumber", label: "Vehicle number", required: true },
        { name: "partyName", label: "Party name" },
        { name: "companyBodyQty", label: "Company body qty (CFT)", type: "number" },
        { name: "extraBodyQty", label: "Extra body qty (CFT)", type: "number" },
      ]}
      columns={[
        { key: "vehicleNumber", label: "Vehicle Number" },
        { key: "partyName", label: "Party Name" },
        { key: "companyBodyQty", label: "Company Body (CFT)" },
        { key: "extraBodyQty", label: "Extra Body (CFT)" },
      ]}
    />
  );
}
