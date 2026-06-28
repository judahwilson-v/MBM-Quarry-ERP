import { Dashboard } from "@/components/modules/dashboard";
import { getDashboardMetrics } from "@/lib/domain/dashboard/service";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Supabase Auth should only be for the cloud dashboard, not the local ERP.
  // We removed the auth redirect so the local ERP dashboard loads immediately.

  const metrics = await getDashboardMetrics();

  return <Dashboard metrics={metrics} />;
}
