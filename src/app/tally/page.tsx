import { TallyExportDashboard } from "./tally-export-dashboard";

export default function TallyPage() {
  return (
    <div className="flex-1 space-y-8 p-4 pt-6 md:p-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[#f39c12]">Tally ERP Integration</h2>
        <p className="text-muted-foreground mt-1">Export your sales data directly into Tally ERP 9 XML format.</p>
      </div>
      
      <TallyExportDashboard />
    </div>
  );
}
