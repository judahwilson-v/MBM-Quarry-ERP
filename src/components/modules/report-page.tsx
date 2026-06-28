"use client";

import { useMemo, useState } from "react";
import { Printer, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency } from "@/lib/utils";
import * as XLSX from "xlsx";
import { format } from "date-fns";

type ReportData = Awaited<ReturnType<typeof import("@/lib/domain/reports/service").getReportData>>;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="print-card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReportPage({ data }: { data: ReportData }) {
  const [mode, setMode] = useState<"daily" | "monthly" | "print">("daily");
  const printable = useMemo(() => JSON.stringify(data, null, 2), [data]);

  function exportToExcel() {
    const wb = XLSX.utils.book_new();

    const addSheet = (dataList: any[], name: string) => {
      if (!dataList || dataList.length === 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Message: "No data" }]), name);
      } else {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataList), name);
      }
    };

    // Daily sheets
    addSheet(data.daily.salesSummary, "Sales Summary");
    addSheet(data.daily.materialWiseSales, "Material Sales");
    addSheet(data.daily.vehicleTripReport, "Vehicle Trips");
    addSheet(data.daily.partyWiseSales, "Party Sales");
    addSheet(data.daily.creditSales, "Credit Sales");
    addSheet(data.daily.expensesSummary, "Expenses");
    addSheet(data.daily.purchasesSummary, "Purchases");
    addSheet(data.daily.dayBookSummary, "Day Book");
    
    // Monthly sheets
    addSheet(data.monthly.salesByMaterial, "Monthly Material Sales");
    addSheet(data.monthly.partyOutstanding, "Party Outstanding");
    addSheet(data.monthly.collections, "Collections");
    addSheet(data.monthly.vehicleUtilization, "Vehicle Utilization");
    addSheet(data.monthly.purchaseSummary, "Monthly Purchases");
    addSheet(data.monthly.expenseSummary, "Monthly Expenses");

    XLSX.writeFile(wb, `MBM_Quarry_Report_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  }

  return (
    <div className={cn("space-y-5 p-4 lg:p-6", mode === "print" && "a4-print")}>
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reports</h1>
          <p className="text-sm text-muted-foreground">Daily, monthly, and print-ready quarry summaries.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMode("daily")}>Daily</Button>
          <Button variant="outline" onClick={() => setMode("monthly")}>Monthly</Button>
          <Button variant="outline" onClick={() => setMode("print")}>Print View</Button>
          <Button variant="outline" onClick={exportToExcel} className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
            <Download className="mr-2 h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print/PDF
          </Button>
        </div>
      </div>

      {mode !== "print" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Daily Reports">
            <div className="space-y-2 text-sm">
              <p>Sales Summary: {data.daily.salesSummary.length}</p>
              <p>Material-wise Sales: {data.daily.materialWiseSales.length}</p>
              <p>Vehicle Trip Report: {data.daily.vehicleTripReport.length}</p>
              <p>Party-wise Sales: {data.daily.partyWiseSales.length}</p>
              <p>Credit Sales: {data.daily.creditSales.length}</p>
              <p>Cash / Bank / GPay Summary: {formatCurrency(data.daily.cashBankGpaySummary.cash)} / {formatCurrency(data.daily.cashBankGpaySummary.bank)} / {formatCurrency(data.daily.cashBankGpaySummary.gpay)}</p>
              <p>Expenses Summary: {data.daily.expensesSummary.length}</p>
              <p>Purchases Summary: {data.daily.purchasesSummary.length}</p>
              <p>Day Book Summary: {data.daily.dayBookSummary.length}</p>
            </div>
          </Section>
          <Section title="Monthly Reports">
            <div className="space-y-2 text-sm">
              <p>Sales by Material: {data.monthly.salesByMaterial.length}</p>
              <p>Party Outstanding: {data.monthly.partyOutstanding.length}</p>
              <p>Collections: {data.monthly.collections.length}</p>
              <p>Vehicle Utilization: {data.monthly.vehicleUtilization.length}</p>
              <p>Purchase Summary: {data.monthly.purchaseSummary.length}</p>
              <p>Expense Summary: {data.monthly.expenseSummary.length}</p>
            </div>
          </Section>
        </div>
      ) : (
        <div className="space-y-4">
          <Section title="Daily Closing Report">
            <pre className="whitespace-pre-wrap text-xs">{printable}</pre>
          </Section>
          <Section title="Party Statement">
            <pre className="whitespace-pre-wrap text-xs">{printable}</pre>
          </Section>
        </div>
      )}
    </div>
  );
}
