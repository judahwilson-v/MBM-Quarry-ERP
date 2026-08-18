"use client";

import { useEffect, useState } from "react";
import { fetchDetailedTableDiff } from "@/app/actions/sync";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Trash2, PlusCircle, ArrowLeftRight } from "lucide-react";

type DetailedDiff = {
  id: string;
  status: 'localOnly' | 'serverOnly' | 'modified' | 'identical';
  localData: any | null;
  serverData: any | null;
};

export default function TableDiffViewer({ tableName, onBack }: { tableName: string; onBack: () => void }) {
  const [diffs, setDiffs] = useState<DetailedDiff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState<'lost' | 'added' | 'modified'>('modified');

  useEffect(() => {
    async function load() {
      try {
        const data = await fetchDetailedTableDiff(tableName);
        setDiffs(data);
      } catch (e: any) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [tableName]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <div className="text-sm font-medium">Analyzing differences for {tableName}...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive p-4 border border-destructive/20 rounded-md bg-destructive/10">
        Failed to load diff: {error}
      </div>
    );
  }

  const lost = diffs.filter(d => d.status === 'localOnly');
  const added = diffs.filter(d => d.status === 'serverOnly');
  const modified = diffs.filter(d => d.status === 'modified');

  const renderJson = (data: any) => (
    <pre className="text-xs p-2 bg-muted rounded-md overflow-auto max-h-[300px]">
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="text-sm text-indigo-500 hover:underline">
          &larr; Back to Summary
        </button>
        <h3 className="font-semibold text-lg flex-1 text-center">Table: {tableName}</h3>
      </div>

      <div className="flex gap-2 border-b">
        <button 
          onClick={() => setActiveTab('lost')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'lost' ? 'border-destructive text-destructive' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4" />
            To be Lost ({lost.length})
          </div>
        </button>
        <button 
          onClick={() => setActiveTab('added')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'added' ? 'border-green-500 text-green-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <PlusCircle className="h-4 w-4" />
            To be Added ({added.length})
          </div>
        </button>
        <button 
          onClick={() => setActiveTab('modified')}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${activeTab === 'modified' ? 'border-amber-500 text-amber-500' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-4 w-4" />
            Modified ({modified.length})
          </div>
        </button>
      </div>

      <div className="max-h-[500px] overflow-auto pr-2 space-y-4">
        {activeTab === 'lost' && (
          lost.length === 0 ? <p className="text-muted-foreground text-sm p-4 text-center">No records will be lost.</p> :
          lost.map(d => (
            <div key={d.id} className="border border-destructive/20 rounded-md p-3">
              <Badge variant="outline" className="mb-2 text-destructive border-destructive/20 bg-destructive/10">ID: {d.id}</Badge>
              {renderJson(d.localData)}
            </div>
          ))
        )}

        {activeTab === 'added' && (
          added.length === 0 ? <p className="text-muted-foreground text-sm p-4 text-center">No new records will be added.</p> :
          added.map(d => (
            <div key={d.id} className="border border-green-500/20 rounded-md p-3">
              <Badge variant="outline" className="mb-2 text-green-500 border-green-500/20 bg-green-500/10">ID: {d.id}</Badge>
              {renderJson(d.serverData)}
            </div>
          ))
        )}

        {activeTab === 'modified' && (
          modified.length === 0 ? <p className="text-muted-foreground text-sm p-4 text-center">No records are modified.</p> :
          modified.map(d => (
            <div key={d.id} className="border border-amber-500/20 rounded-md p-3 space-y-2">
              <Badge variant="outline" className="text-amber-600 border-amber-500/20 bg-amber-500/10">ID: {d.id}</Badge>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold mb-1 text-muted-foreground text-center">Local Data (Will be overwritten)</div>
                  {renderJson(d.localData)}
                </div>
                <div>
                  <div className="text-xs font-semibold mb-1 text-indigo-500 text-center">Server Data (Incoming)</div>
                  {renderJson(d.serverData)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
