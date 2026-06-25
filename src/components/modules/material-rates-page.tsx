"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMaterials, updateMaterialRate } from "@/lib/offline-actions";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type MaterialRow = {
  id: string;
  materialName: string;
  ratePerCft: number;
  updatedAt: string;
  createdAt: string;
};

export function MaterialRatesPage() {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [editingId, setEditingId] = useState("");
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const rows = (await listMaterials()) as unknown as MaterialRow[];
    setMaterials(rows);
    setDraftRates(Object.fromEntries(rows.map((row) => [row.id, String(row.ratePerCft)])));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveRate(id: string) {
    setError("");
    setMessage("");
    try {
      await updateMaterialRate(id, draftRates[id]);
      setEditingId("");
      setMessage("Rate updated. New sales will use the updated rate.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rate update failed.");
    }
  }

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Material Rates</h1>
        <p className="text-sm text-muted-foreground">Update current CFT rates for new sales.</p>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {message ? <p className="text-sm text-success">{message}</p> : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material Name</TableHead>
                <TableHead className="text-right">Current Rate (₹/CFT)</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead className="w-36 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((material) => {
                const editing = editingId === material.id;
                return (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.materialName}</TableCell>
                    <TableCell className="number-cell">
                      {editing ? (
                        <Input
                          className="ml-auto w-32 text-right tabular-nums"
                          type="number"
                          step="0.01"
                          value={draftRates[material.id] ?? ""}
                          onChange={(event) =>
                            setDraftRates((current) => ({ ...current, [material.id]: event.target.value }))
                          }
                        />
                      ) : (
                        formatCurrency(material.ratePerCft)
                      )}
                    </TableCell>
                    <TableCell>{formatDateTime(material.updatedAt ?? material.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <Button size="sm" onClick={() => void saveRate(material.id)}>
                          <Save className="h-4 w-4" />
                          Save
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => setEditingId(material.id)}>
                          <Pencil className="h-4 w-4" />
                          Edit Rate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!materials.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    Loading materials...
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
