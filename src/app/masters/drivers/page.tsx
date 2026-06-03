import { MasterDataPage } from "@/components/modules/master-data-page";

export default function DriversPage() {
  return (
    <MasterDataPage
      resource="drivers"
      title="Drivers"
      description="Driver contact details and assigned vehicles."
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "mobile", label: "Mobile" },
        { name: "vehicleId", label: "Vehicle assigned", type: "select" },
      ]}
      columns={[
        { key: "name", label: "Driver" },
        { key: "mobile", label: "Mobile" },
        { key: "vehicle.vehicleNumber", label: "Vehicle" },
      ]}
    />
  );
}
