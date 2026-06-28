"use client";

import { useState } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { exportSalesToTallyXML } from "@/app/actions/tally";
import { CalendarIcon, Download, FileJson, Info } from "lucide-react";

export function TallyExportDashboard() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [gstOnly, setGstOnly] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);
    
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      const response = await exportSalesToTallyXML(start, end, gstOnly);
      
      if (!response.success || !response.xml) {
        toast({
          title: "Export Failed",
          description: response.error || "Unknown error occurred",
          variant: "destructive"
        });
        setIsExporting(false);
        return;
      }
      
      // Create a Blob from the XML string and trigger download
      const blob = new Blob([response.xml], { type: 'text/xml' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MBM_Tally_Export_${format(start, "MMM_yyyy")}.xml`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: `Tally XML generated successfully.`,
      });
      
    } catch (e: any) {
      toast({
        title: "Export Error",
        description: e.message,
        variant: "destructive"
      });
    } finally {
      setIsExporting(false);
    }
  };
  
  const setLastMonth = () => {
    const today = new Date();
    const lastMonth = subMonths(today, 1);
    setStartDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
  };
  
  const setThisMonth = () => {
    const today = new Date();
    setStartDate(format(startOfMonth(today), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(today), "yyyy-MM-dd"));
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="rounded-xl border bg-card text-card-foreground shadow">
        <div className="p-6 pb-4 border-b">
          <h3 className="tracking-tight text-lg font-semibold flex items-center">
            <FileJson className="w-5 h-5 mr-2 text-[#f39c12]" />
            Generate XML Export
          </h3>
        </div>
        <div className="p-6 space-y-6">
          
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={setThisMonth}>This Month</Button>
            <Button variant="outline" size="sm" onClick={setLastMonth}>Last Month</Button>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pl-10"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2 pt-2 border-t">
            <label className="text-sm font-medium">Export Options</label>
            <div className="flex items-center space-x-2 mt-2">
              <input 
                type="checkbox" 
                id="gstOnly" 
                checked={gstOnly} 
                onChange={(e) => setGstOnly(e.target.checked)}
                className="rounded border-gray-300 text-[#f39c12] focus:ring-[#f39c12]"
              />
              <label htmlFor="gstOnly" className="text-sm cursor-pointer">
                Include ONLY GST-enabled sales (Recommended)
              </label>
            </div>
          </div>
          
          <Button 
            className="w-full bg-[#f39c12] hover:bg-[#d68910] text-white" 
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "Generating XML..." : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download Tally XML
              </>
            )}
          </Button>
        </div>
      </div>
      
      <div className="space-y-6">
        <div className="rounded-xl border bg-amber-500/5 overflow-hidden">
          <div className="p-4 border-b border-amber-500/10 bg-amber-500/10 flex items-start">
            <Info className="w-5 h-5 text-amber-500 mt-0.5 mr-3 shrink-0" />
            <div>
              <h4 className="font-medium text-amber-700 dark:text-amber-500">Tally Setup Instructions</h4>
              <p className="text-sm text-amber-600/80 dark:text-amber-500/80 mt-1">
                Before importing this XML into Tally, ensure your company contains the following exact ledger names:
              </p>
            </div>
          </div>
          <div className="p-4 bg-card text-sm">
            <ul className="space-y-2 list-disc pl-5 text-muted-foreground">
              <li><span className="font-mono text-foreground font-semibold">GST SALES</span> (Under Sales Accounts)</li>
              <li><span className="font-mono text-foreground font-semibold">SGST</span> (Under Duties & Taxes)</li>
              <li><span className="font-mono text-foreground font-semibold">CGST</span> (Under Duties & Taxes)</li>
              <li>All Customer Names must exactly match your Tally Party Ledgers.</li>
              <li>All Material Names must exactly match your Tally Stock Items.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
