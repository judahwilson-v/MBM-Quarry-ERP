import { TallyExportDashboard } from "./tally-export-dashboard";

export default function TallyPage() {
  return (
    <div className="flex-1 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-[#f39c12]">Tally ERP Integration</h2>
        <p className="text-muted-foreground mt-1">Export your sales data directly into Tally ERP 9 XML format.</p>
      </div>
      
      <div className="relative mt-8">
        <div className="absolute inset-0 z-10 bg-background/60 backdrop-blur-[2px] flex items-center justify-center rounded-xl border border-border/50">
          <div className="bg-card text-card-foreground p-8 rounded-xl shadow-xl border text-center max-w-md animate-in fade-in zoom-in duration-300">
            <h3 className="text-2xl font-bold mb-3 flex items-center justify-center gap-2">
              <span className="text-2xl">🚧</span>
              Tally Export
            </h3>
            <p className="text-muted-foreground font-medium text-lg mb-2">Coming Soon</p>
            <p className="text-sm text-muted-foreground">This feature is currently under active development and will be released in an upcoming update.</p>
          </div>
        </div>
        <div className="pointer-events-none opacity-40 select-none">
          <TallyExportDashboard />
        </div>
      </div>
    </div>
  );
}
