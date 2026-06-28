"use client";

import { useState } from "react";
import { updateGlobalSettings } from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Loader2, CheckCircle2 } from "lucide-react";

export function SettingsForm({ initialData }: { initialData: any }) {
  const [formData, setFormData] = useState({
    quarryName: initialData?.quarryName || "",
    gstNumber: initialData?.gstNumber || "",
    address: initialData?.address || "",
    phone: initialData?.phone || "",
    defaultPrinter: initialData?.defaultPrinter || "",
    backupFolder: initialData?.backupFolder || "",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setSaveStatus("idle");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveStatus("idle");
    
    const result = await updateGlobalSettings(formData);
    
    if (result.success) {
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } else {
      setSaveStatus("error");
    }
    
    setIsSaving(false);
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border bg-card text-card-foreground shadow">
      <div className="p-6 pb-4 border-b flex justify-between items-center">
        <h3 className="tracking-tight text-lg font-semibold">Business Profile</h3>
      </div>
      <div className="p-6 space-y-4">
        <div className="space-y-2">
          <label htmlFor="quarryName" className="text-sm font-medium leading-none">Quarry Name</label>
          <Input 
            id="quarryName" 
            name="quarryName" 
            value={formData.quarryName} 
            onChange={handleChange} 
          />
        </div>
        
        <div className="space-y-2">
          <label htmlFor="gstNumber" className="text-sm font-medium leading-none">GST Number</label>
          <Input 
            id="gstNumber" 
            name="gstNumber" 
            value={formData.gstNumber} 
            onChange={handleChange} 
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="address" className="text-sm font-medium leading-none">Address</label>
          <Input 
            id="address" 
            name="address" 
            value={formData.address} 
            onChange={handleChange} 
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="phone" className="text-sm font-medium leading-none">Phone Number</label>
          <Input 
            id="phone" 
            name="phone" 
            value={formData.phone} 
            onChange={handleChange} 
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="defaultPrinter" className="text-sm font-medium leading-none">Default Printer Name (Optional)</label>
          <Input 
            id="defaultPrinter" 
            name="defaultPrinter" 
            value={formData.defaultPrinter} 
            onChange={handleChange} 
            placeholder="e.g., EPSON L3150 Series"
          />
          <div className="flex items-center gap-2 mt-3 pt-2">
            <input 
              type="checkbox" 
              id="silentPrinting" 
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
              checked={typeof window !== 'undefined' ? localStorage.getItem('silentPrinting') === 'true' : false}
              onChange={(e) => {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('silentPrinting', e.target.checked ? 'true' : 'false');
                  // Trigger re-render to update checkbox visually
                  setFormData({...formData}); 
                }
              }}
            />
            <label htmlFor="silentPrinting" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Enable Silent Printing for Receipts (Skips PDF preview)
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="backupFolder" className="text-sm font-medium leading-none">Custom Backup Folder Path (Optional)</label>
          <Input 
            id="backupFolder" 
            name="backupFolder" 
            value={formData.backupFolder} 
            onChange={handleChange} 
            placeholder="e.g., D:\Backups\MBM"
          />
        </div>

        <Button type="submit" disabled={isSaving} className="w-full gap-2">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>

        {saveStatus === "success" && (
          <div className="text-sm text-emerald-500 flex items-center gap-1 justify-center pt-2">
            <CheckCircle2 className="h-4 w-4" />
            Settings saved successfully!
          </div>
        )}
        
        {saveStatus === "error" && (
          <div className="text-sm text-red-500 text-center pt-2">
            Failed to save settings.
          </div>
        )}
      </div>
    </form>
  );
}
