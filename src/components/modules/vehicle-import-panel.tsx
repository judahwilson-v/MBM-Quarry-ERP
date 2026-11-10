"use client";

// FULL77: in-app entry point for the private vehicle CSV import.
// The flow is always preview -> review -> explicit decisions -> commit.
// A conflicting duplicate group is never resolved silently: every group is
// shown with its rows and the reviewer either picks a line or explicitly
// excludes the group. Exclusion is a per-import choice, never a standing
// default. Nothing is written until "Confirm import" succeeds.
import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { importVehiclesCsv } from "@/app/actions/vehicles";
import type { VehicleImportDecision, VehicleImportReport, VehicleImportRow } from "@/app/actions/vehicles";
import { getSessionToken } from "@/lib/session-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function groupRows(rows: VehicleImportRow[], status: string) {
  return rows.filter((r) => r.status === status);
}

function conflictGroups(rows: VehicleImportRow[]) {
  const groups = new Map<string, VehicleImportRow[]>();
  for (const r of rows) {
    if (r.status !== "conflict") continue;
    const g = groups.get(r.groupKey) ?? [];
    g.push(r);
    groups.set(r.groupKey, g);
  }
  return [...groups.entries()];
}

export function VehicleImportPanel({ onImported }: { onImported?: () => void }) {
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<VehicleImportReport | null>(null);
  const [result, setResult] = useState<VehicleImportReport | null>(null);
  const [decisions, setDecisions] = useState<Record<string, VehicleImportDecision>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pickFile(file: File | null) {
    setError("");
    setPreview(null);
    setResult(null);
    setDecisions({});
    if (!file) return;
    setFileName(file.name);
    setCsvText(await file.text());
  }

  async function runPreview() {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const report = await importVehiclesCsv(csvText, "preview", undefined, getSessionToken());
      if (report.refused || report.fileError) {
        setError(report.refused || report.fileError || "Import refused.");
        setPreview(null);
        return;
      }
      setPreview(report);
      // No pre-selected answers: every conflicting group needs the
      // reviewer's own click before Confirm enables. Nothing is implied.
      setDecisions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runCommit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const report = await importVehiclesCsv(csvText, "commit", decisions, getSessionToken(), preview.previewToken);
      if (report.refused || report.fileError) {
        setError(report.refused || report.fileError || "Import refused.");
        return;
      }
      setResult(report);
      setPreview(null);
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const conflicts = preview ? conflictGroups(preview.rows) : [];
  const invalidRows = preview ? groupRows(preview.rows, "invalid") : [];
  const dbConflicts = preview ? groupRows(preview.rows, "db-conflict") : [];
  const canCommit = !!preview && !preview.fileError && preview.invalid === 0 && conflicts.every(([key]) => decisions[key] !== undefined);

  return (
    <Card>
      <CardContent className="grid gap-4 pt-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Import vehicle list (CSV)</h2>
          <p className="text-sm text-muted-foreground">
            Preview a CSV file first. New vehicles are added only after you review the preview and confirm.
            Existing vehicles are never overwritten, and conflicting duplicates need your explicit choice each time.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
            <FileUp className="h-4 w-4" />
            {fileName || "Choose CSV file"}
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button disabled={!csvText || busy} onClick={() => void runPreview()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Preview import
          </Button>
        </div>

        {error && <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {preview && (
          <div className="grid gap-4">
            <p className="text-sm">
              {preview.totalRows} data row(s): {preview.creates} new, {preview.skips} skipped (already in the app or identical repeats),{" "}
              {preview.conflicts} conflict(s), {preview.invalid} invalid.
              {preview.skippedRows.length > 0 && ` ${preview.skippedRows.length} blank/header/comment line(s) skipped (lines ${preview.skippedRows.map((s) => s.line).join(", ")}).`}
            </p>

            {groupRows(preview.rows, "create").length > 0 && (
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">New vehicles that will be added - check the actual values:</p>
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground">
                        <th className="pr-3">Line</th><th className="pr-3">Vehicle</th><th className="pr-3">Company body</th><th className="pr-3">Extra body</th><th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows(preview.rows, "create").map((r) => (
                        <tr key={r.line}>
                          <td className="pr-3">{r.line}</td>
                          <td className="pr-3">{r.vehicleNumber}</td>
                          <td className="pr-3">{r.companyBodyQty ?? "-"}</td>
                          <td className="pr-3">{r.extraBodyQty ?? "-"}</td>
                          <td>{r.vehicleType ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {invalidRows.length > 0 && (
              <div className="rounded-md border border-red-300 p-3">
                <p className="mb-2 text-sm font-medium text-red-700">Fix these rows in the file - nothing can be imported while they are invalid:</p>
                <ul className="list-disc pl-5 text-sm">
                  {invalidRows.map((r) => (
                    <li key={r.line}>Line {r.line}: {r.vehicleNumber || "(blank)"} - {r.note}</li>
                  ))}
                </ul>
              </div>
            )}

            {dbConflicts.length > 0 && (
              <div className="rounded-md border border-amber-300 p-3">
                <p className="mb-2 text-sm font-medium text-amber-700">Already in the app with different values - these stay as they are (not overwritten):</p>
                <ul className="list-disc pl-5 text-sm">
                  {dbConflicts.map((r) => (
                    <li key={r.line}>Line {r.line}: {r.vehicleNumber} - {r.note}</li>
                  ))}
                </ul>
              </div>
            )}

            {conflicts.map(([key, rows]) => (
              <div key={key} className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">
                  {rows[0].vehicleNumber} appears {rows.length} times with different values. Choose what to import:
                </p>
                <div className="grid gap-1 text-sm">
                  {rows.map((r) => (
                    <label key={r.line} className="flex items-center gap-2">
                      <input
                        type="radio"
                        name={`conflict-${key}`}
                        checked={decisions[key] === r.line}
                        onChange={() => setDecisions((d) => ({ ...d, [key]: r.line }))}
                      />
                      Import line {r.line} (company body {r.companyBodyQty ?? "-"}, extra body {r.extraBodyQty ?? "-"}, type {r.vehicleType ?? "-"})
                    </label>
                  ))}
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`conflict-${key}`}
                      checked={decisions[key] === "exclude"}
                      onChange={() => setDecisions((d) => ({ ...d, [key]: "exclude" }))}
                    />
                    Import none of these rows (explicit choice)
                  </label>
                </div>
              </div>
            ))}

            <div className="flex gap-2">
              <Button disabled={!canCommit || busy} onClick={() => void runCommit()}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm import
              </Button>
              <Button variant="outline" onClick={() => { setPreview(null); setDecisions({}); }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {result && (
          <p className="rounded-md border border-green-300 bg-green-50 p-3 text-sm text-green-700">
            Import complete: {result.committed ?? 0} vehicle(s) added. {result.skips} row(s) skipped, {result.conflicts} left out for review, {result.invalid} invalid.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
