"use client";

import { MasterDataPage } from "@/components/modules/master-data-page";
import { VehicleImportPanel } from "@/components/modules/vehicle-import-panel";

import { useState } from "react";

export default function VehiclesPage() {
  // Remount the list after a successful import so the new vehicles show
  // immediately - no stale list, no manual browser reload.
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="space-y-5">
      <div className="px-4 pt-4 lg:px-6 lg:pt-6">
        <VehicleImportPanel onImported={() => setRefreshKey((k) => k + 1)} />
      </div>
    <MasterDataPage
      key={refreshKey}
      resource="vehicles"
      title="Vehicles"
      description="Truck numbers and default loading capacities (CFT)."
      fields={[
        { name: "vehicleNumber", label: "Vehicle number", required: true },
        { name: "partyName", label: "Party name" },
        { name: "companyBodyQty", label: "Company body qty (CFT)", type: "number" },
        { name: "extraBodyQty", label: "Extra body qty (CFT)", type: "number" },
        { name: "vehicleType", label: "Vehicle type" },
      ]}
      columns={[
        { key: "vehicleNumber", label: "Vehicle Number" },
        { key: "partyName", label: "Party Name" },
        { key: "companyBodyQty", label: "Company Body (CFT)" },
        { key: "extraBodyQty", label: "Extra Body (CFT)" },
        { key: "vehicleType", label: "Type" },
      ]}
    />
    </div>
  );
}
