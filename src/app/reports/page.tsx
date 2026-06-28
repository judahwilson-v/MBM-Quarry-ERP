import { ReportPage } from "@/components/modules/report-page";
import { getReportData } from "@/lib/domain/reports/service";

export default async function ReportsRoute() {
  const data = await getReportData();
  return <ReportPage data={data} />;
}
