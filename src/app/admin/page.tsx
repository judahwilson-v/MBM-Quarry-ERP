import { getGlobalSettings } from "@/app/actions/settings";
import { AdminDashboard } from "./admin-dashboard";

export default async function AdminPage() {
  const settings = await getGlobalSettings();
  
  return (
    <div className="flex-1 space-y-8 p-4 pt-6 md:p-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Administrator Tools</h2>
        <p className="text-muted-foreground mt-1">Diagnostic tools and advanced sync controls for the developer.</p>
      </div>
      
      <AdminDashboard expectedPin={settings.adminPin} />
    </div>
  );
}
