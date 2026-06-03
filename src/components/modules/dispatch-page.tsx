"use client";

import { useEffect, useState } from "react";
import { Download, MessageCircle, Printer, Stamp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { downloadBlob, formatCurrency, formatDate } from "@/lib/utils";

export function DispatchPage({ slipId }: { slipId: string }) {
  const [slip, setSlip] = useState<any>(null);
  const [duplicate, setDuplicate] = useState(false);

  async function load() {
    const body = await fetch(`/api/v1/dispatch/${slipId}`).then((response) => response.json());
    setSlip(body);
  }

  useEffect(() => {
    void load();
  }, [slipId]);

  async function printDuplicate() {
    if (!slip?.id) return;
    await fetch(`/api/v1/dispatch/${slip.id}/print`, { method: "POST" });
    setDuplicate(true);
    await load();
    window.setTimeout(() => window.print(), 100);
  }

  async function share() {
    if (!slip) return;
    const text = slipText(slip);
    const blob = await createSlipPdf(slip);
    const file = new File([blob], `${slip.slipNumber}.pdf`, { type: "application/pdf" });
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
    };
    if (navigator.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await navigator.share({
        title: `Dispatch Slip ${slip.slipNumber}`,
        text,
        files: [file],
      });
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  if (!slip) {
    return <div className="p-6 text-sm text-muted-foreground">Loading dispatch slip...</div>;
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="no-print flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Dispatch Slip</h1>
          <p className="text-sm text-muted-foreground">PDF download, print, WhatsApp share, and duplicate copy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void createSlipPdf(slip).then((blob) => downloadBlob(blob, `${slip.slipNumber}.pdf`))}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={() => void share()}>
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </Button>
          <Button onClick={() => void printDuplicate()}>
            <Stamp className="h-4 w-4" />
            Duplicate
          </Button>
        </div>
      </div>
      <Card className="print-card mx-auto max-w-xl bg-white text-slate-950">
        <CardContent className="relative p-8 font-mono">
          {duplicate ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-6xl font-black text-slate-200 rotate-[-24deg]">
              DUPLICATE
            </div>
          ) : null}
          <SlipView slip={slip} duplicate={duplicate} />
        </CardContent>
      </Card>
    </div>
  );
}

function SlipView({ slip }: { slip: any; duplicate?: boolean }) {
  const sale = slip.sale;
  return (
    <div className="relative space-y-4">
      <pre className="text-center text-sm leading-5">
{`==========================================
          MBM QUARRY
          DISPATCH SLIP
==========================================`}
      </pre>
      <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <span>Slip No:</span><span>{slip.slipNumber}</span>
        <span>Date:</span><span>{formatDate(slip.issuedAt)}</span>
        <span>Time:</span><span>{sale.time ?? new Date(sale.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
      </div>
      <div className="border-y border-dashed border-slate-400 py-4">
        <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <span>Vehicle:</span><span>{sale.vehicle?.vehicleNumber}</span>
          <span>Body:</span><span>{bodyText(sale.vehicle)}</span>
          <span>Driver:</span><span>{slip.driver?.name ?? "-"}</span>
          <span>Party:</span><span>{sale.party?.name}</span>
        </div>
      </div>
      <div className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <span>Material:</span><span>{sale.material?.name}</span>
        <span>Quantity:</span><span>{sale.qty} CFT</span>
        <span>Rate:</span><span>{formatCurrency(sale.rate)}/CFT</span>
        <span>Gross:</span><span>{formatCurrency(sale.grossAmount)}</span>
        <span>Discount:</span><span>{formatCurrency(sale.discountAmount)}</span>
        <span>NET TOTAL:</span><span>{formatCurrency(sale.netAmount)}</span>
        <span>Payment:</span><span>{paymentText(sale)}</span>
        <span>Operator:</span><span>{sale.operatorName ?? "-"}</span>
      </div>
      <div className="pt-10 text-center text-sm">Authorized Signature</div>
      <pre className="text-center text-sm">==========================================</pre>
      <div className="text-center text-xs text-slate-500">Print count: {slip.printCount}</div>
    </div>
  );
}

function slipText(slip: any) {
  return [
    `MBM Quarry Dispatch Slip`,
    `Slip: ${slip.slipNumber}`,
    `Vehicle: ${slip.sale.vehicle?.vehicleNumber}`,
    `Party: ${slip.sale.party?.name}`,
    `Material: ${slip.sale.material?.name} - ${slip.sale.qty} CFT`,
    `Net: ${formatCurrency(slip.sale.netAmount)}`,
    `Payment: ${paymentText(slip.sale)}`,
  ].join("\n");
}

function bodyText(vehicle: any) {
  if (!vehicle) return "-";
  return [
    `Company ${vehicle.companyBody ? "Yes" : "No"}`,
    `Extra ${vehicle.extraBody ? "Yes" : "No"}`,
    `Pickup ${vehicle.isPickup ? "Yes" : "No"}`,
  ].join("  ");
}

function paymentText(sale: any) {
  return [
    ["Cash", sale.cashAmount],
    ["Bank", sale.bankAmount],
    ["GPay", sale.gpayAmount],
    ["Credit", sale.creditAmount],
  ]
    .filter(([, amount]) => Number(amount ?? 0) > 0)
    .map(([label, amount]) => `${label} ${formatCurrency(amount)}`)
    .join(" + ");
}

async function createSlipPdf(slip: any) {
  const React = await import("react");
  const renderer = await import("@react-pdf/renderer");
  const { Document, Page, Text, View, StyleSheet, pdf } = renderer;
  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 12, fontFamily: "Courier" },
    center: { textAlign: "center" },
    title: { fontSize: 18, fontWeight: "bold", marginBottom: 4 },
    line: { marginVertical: 8, borderBottom: "1 solid #333" },
    row: { flexDirection: "row", marginVertical: 4 },
    label: { width: 110, fontWeight: "bold" },
    signature: { textAlign: "center", marginTop: 60 },
  });
  const sale = slip.sale;
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A5", style: styles.page },
      React.createElement(Text, { style: [styles.center, styles.title] }, "MBM QUARRY"),
      React.createElement(Text, { style: styles.center }, "DISPATCH SLIP"),
      React.createElement(View, { style: styles.line }),
      row("Slip No:", slip.slipNumber),
      row("Date:", formatDate(slip.issuedAt)),
      row("Time:", sale.time ?? ""),
      React.createElement(View, { style: styles.line }),
      row("Vehicle:", sale.vehicle?.vehicleNumber),
      row("Body:", bodyText(sale.vehicle)),
      row("Driver:", slip.driver?.name ?? "-"),
      row("Party:", sale.party?.name),
      React.createElement(View, { style: styles.line }),
      row("Material:", sale.material?.name),
      row("Quantity:", `${sale.qty} CFT`),
      row("Rate:", `${formatCurrency(sale.rate)}/CFT`),
      row("Gross:", formatCurrency(sale.grossAmount)),
      row("Discount:", formatCurrency(sale.discountAmount)),
      row("NET TOTAL:", formatCurrency(sale.netAmount)),
      row("Payment:", paymentText(sale)),
      row("Operator:", sale.operatorName ?? "-"),
      React.createElement(Text, { style: styles.signature }, "Authorized Signature"),
    ),
  );

  function row(label: string, value: string) {
    return React.createElement(
      View,
      { style: styles.row },
      React.createElement(Text, { style: styles.label }, label),
      React.createElement(Text, null, value),
    );
  }

  return pdf(doc).toBlob();
}
