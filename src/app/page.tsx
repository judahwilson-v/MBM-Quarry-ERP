import { Dashboard } from "@/components/modules/dashboard";
import { getDashboardMetrics } from "@/lib/domain/dashboard/service";
import { getGlobalSettings } from "@/app/actions/settings";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Home() {
  const settings = await getGlobalSettings();
  if (settings.quarryName === "MBM Quarry" && !settings.gstNumber) {
    redirect("/setup");
  }

  const metrics = await getDashboardMetrics();

  return <Dashboard metrics={metrics} />;
}
