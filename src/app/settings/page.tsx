import { getGlobalSettings } from "@/app/actions/settings";
import { SettingsForm } from "./settings-form";
import { AuditLogManager } from "./audit-log-manager";
import { SystemDiagnostics } from "./system-diagnostics";
import { SecuritySettings } from "./security-settings";
import fs from "fs";
import path from "path";

export default async function SettingsPage() {
  const settings = await getGlobalSettings();
  
  let appVersion = process.env.NEXT_PUBLIC_APP_VERSION;
  
  if (!appVersion) {
    try {
      const versionFile = path.join(process.cwd(), "VERSION");
      if (fs.existsSync(versionFile)) {
        const content = fs.readFileSync(versionFile, "utf-8");
        const versionMatch = content.match(/VERSION=(.*)/);
        if (versionMatch) appVersion = versionMatch[1].trim();
      }
    } catch {
      // Ignore
    }
  }

  appVersion = appVersion || "0.1.0";
  const databasePath = process.env.DATABASE_URL || "Local DB";
  
  return (
    <div className="flex-1 space-y-8 p-4 pt-6 md:p-8 max-w-5xl mx-auto">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">Manage business details and application preferences</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-6">
          <SettingsForm initialData={settings} />
        </div>
        
        <div className="space-y-6">
          <SecuritySettings initialSettings={settings} />
          <SystemDiagnostics 
            appVersion={appVersion}
            databasePath={databasePath}
            backupPath="~/Documents/MBM-Backups"
          />
          <AuditLogManager />
        </div>
      </div>
    </div>
  );
}
