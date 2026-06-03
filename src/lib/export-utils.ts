"use client";

import { downloadBlob, toCsv } from "@/lib/utils";

export function flattenRow(row: Record<string, unknown>) {
  const flattened: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const maybeName = value as Record<string, unknown>;
      flattened[key] = maybeName.name ?? maybeName.vehicleNumber ?? maybeName.code ?? maybeName.id ?? JSON.stringify(value);
    } else {
      flattened[key] = value;
    }
  }
  return flattened;
}

export async function downloadExcel(rows: Array<Record<string, unknown>>, fileName: string, sheetName = "Report") {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  const flattened = rows.map(flattenRow);
  const headers = Object.keys(flattened[0] ?? { Empty: "" });
  sheet.addRow(headers);
  flattened.forEach((row) => sheet.addRow(headers.map((header) => row[header])));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = Math.min(Math.max(String(column.values?.join(" ") ?? "").length / 4, 12), 32);
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer]), fileName);
}

export function downloadCsv(rows: Array<Record<string, unknown>>, fileName: string) {
  const flattened = rows.map(flattenRow);
  downloadBlob(new Blob([toCsv(flattened)], { type: "text/csv;charset=utf-8" }), fileName);
}

export async function downloadSimplePdf({
  title,
  rows,
  fileName,
}: {
  title: string;
  rows: Array<Record<string, unknown>>;
  fileName: string;
}) {
  const React = await import("react");
  const renderer = await import("@react-pdf/renderer");
  const flattened = rows.map(flattenRow);
  const headers = Object.keys(flattened[0] ?? { Empty: "" }).slice(0, 8);
  const Document = renderer.Document;
  const Page = renderer.Page;
  const Text = renderer.Text;
  const View = renderer.View;
  const StyleSheet = renderer.StyleSheet;
  const pdf = renderer.pdf;
  const styles = StyleSheet.create({
    page: { padding: 24, fontSize: 8, fontFamily: "Helvetica" },
    title: { fontSize: 16, marginBottom: 4, fontWeight: "bold" },
    subtitle: { fontSize: 10, marginBottom: 12 },
    row: { flexDirection: "row", borderBottom: "1 solid #ddd" },
    header: { backgroundColor: "#eaf2ff", fontWeight: "bold" },
    cell: { flex: 1, padding: 4 },
  });
  const doc = React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      React.createElement(Text, { style: styles.title }, "MBM Quarry"),
      React.createElement(Text, { style: styles.subtitle }, title),
      React.createElement(
        View,
        { style: [styles.row, styles.header] },
        headers.map((header) => React.createElement(Text, { key: header, style: styles.cell }, header)),
      ),
      flattened.map((row, index) =>
        React.createElement(
          View,
          { key: index, style: styles.row },
          headers.map((header) =>
            React.createElement(Text, { key: header, style: styles.cell }, String(row[header] ?? "").slice(0, 80)),
          ),
        ),
      ),
    ),
  );
  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, fileName);
}
