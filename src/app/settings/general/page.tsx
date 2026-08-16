import { getGlobalSettings } from "@/app/actions/settings";
import { SettingsForm } from "./settings-form";
import { AuditLogManager } from "./audit-log-manager";
import { SystemDiagnostics } from "./system-diagnostics";
import { SecuritySettings } from "./security-settings";
import { ThemeSettings } from "./theme-settings";
import fs from "fs";
import path from "path";

export const dynamic = 'force-dynamic';

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

  appVersion = appVersion || "2.1.0";
  const databasePath = process.env.DATABASE_URL || "Local DB";
  
  return (
    <div className="flex-1 space-y-6">
      <div className="grid gap-6">
        <SystemDiagnostics 
          appVersion={appVersion}
          databasePath={databasePath}
          backupPath="~/Documents/MBM-Backups"
        />
        
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-6">
            <SettingsForm initialData={settings} />
          </div>
          
          <div className="space-y-6">
            <ThemeSettings />
            <SecuritySettings initialSettings={settings} />
            <AuditLogManager />
          </div>
        </div>
      </div>
    </div>
  );
}
