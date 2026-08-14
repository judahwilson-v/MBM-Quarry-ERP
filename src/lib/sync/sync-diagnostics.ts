export interface SyncDiagnosticEntry {
  id: string;           // uuid
  timestamp: string;    // ISO string
  level: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  phase: 'PUSH' | 'PULL' | 'CURSOR' | 'PROJECTION' | 'RETENTION' | 'INIT';
  table: string;
  entityId?: string;
  message: string;
  errorCode?: string;   // e.g. '23503' (FK), '23505' (Unique), 'NETWORK'
  details?: Record<string, unknown>;  // extra context for debugging
  resolution?: string;  // what the engine did about it
  stackTrace?: string;  // abbreviated stack
}

export interface HeldLogEntry {
  table: string;
  entityId: string;
  action: 'create' | 'update' | 'delete';
  reason: string;  // Human-readable reason
  fkTable?: string; // Which parent table is missing
  fkColumn?: string; // Which FK column failed
  createdAt: string;
  retryCount: number;
}

export interface SyncRunSummary {
  startedAt: string;
  completedAt: string;
  durationMs: number;
  phase: 'PUSH' | 'PULL' | 'BOTH';
  pushed: number;
  pulled: number;
  skipped: number;
  held: number;
  errors: number;
  status: 'IDLE' | 'ERROR' | 'PARTIAL_SUCCESS';
  modelBreakdown: Array<{
    model: string;
    table: string;
    pushed: number;
    pulled: number;
    errors: number;
    status: 'ok' | 'error' | 'skipped';
  }>;
}

export class SyncDiagnostics {
  private static instance: SyncDiagnostics;
  private entries: SyncDiagnosticEntry[] = [];
  private maxEntries = 200; // Ring buffer
  private heldLogs: HeldLogEntry[] = [];
  private lastSyncRun: SyncRunSummary | null = null;

  private constructor() {}

  static getInstance(): SyncDiagnostics {
    if (!SyncDiagnostics.instance) {
      SyncDiagnostics.instance = new SyncDiagnostics();
    }
    return SyncDiagnostics.instance;
  }

  log(entry: Omit<SyncDiagnosticEntry, 'id' | 'timestamp'>): void {
    const id = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : Math.random().toString(36).substring(2) + Date.now().toString(36);
      
    const newEntry: SyncDiagnosticEntry = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(newEntry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    // Console logging at appropriate levels
    const logMsg = `[SYNC ${entry.level}] ${entry.phase} - ${entry.table}: ${entry.message}`;
    if (entry.level === 'INFO') {
      console.log(logMsg, entry.details || '');
    } else if (entry.level === 'WARN') {
      console.warn(logMsg, entry.details || '');
    } else if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      console.error(logMsg, entry.errorCode ? `(Code: ${entry.errorCode})` : '', entry.details || '');
    }
  }

  info(phase: SyncDiagnosticEntry['phase'], table: string, message: string, details?: Record<string, unknown>): void {
    this.log({ level: 'INFO', phase, table, message, details });
  }

  warn(phase: SyncDiagnosticEntry['phase'], table: string, message: string, details?: Record<string, unknown>): void {
    this.log({ level: 'WARN', phase, table, message, details });
  }

  error(phase: SyncDiagnosticEntry['phase'], table: string, message: string, errorCode?: string, details?: Record<string, unknown>): void {
    this.log({ level: 'ERROR', phase, table, message, errorCode, details });
  }

  fatal(phase: SyncDiagnosticEntry['phase'], table: string, message: string, errorCode?: string, details?: Record<string, unknown>): void {
    this.log({ level: 'FATAL', phase, table, message, errorCode, details });
  }

  setHeldLogs(logs: HeldLogEntry[]): void {
    this.heldLogs = logs;
  }

  getHeldLogs(): HeldLogEntry[] {
    return this.heldLogs;
  }

  setLastSyncRun(summary: SyncRunSummary): void {
    this.lastSyncRun = summary;
  }

  getLastSyncRun(): SyncRunSummary | null {
    return this.lastSyncRun;
  }

  getEntries(filter?: { level?: string; phase?: string; table?: string; limit?: number }): SyncDiagnosticEntry[] {
    let result = this.entries;
    
    if (filter) {
      if (filter.level) result = result.filter(e => e.level === filter.level);
      if (filter.phase) result = result.filter(e => e.phase === filter.phase);
      if (filter.table) result = result.filter(e => e.table === filter.table);
      if (filter.limit && filter.limit > 0) {
        result = result.slice(-filter.limit);
      }
    }
    
    return result;
  }

  getErrors(limit?: number): SyncDiagnosticEntry[] {
    let result = this.entries.filter(e => e.level === 'ERROR' || e.level === 'FATAL');
    if (limit && limit > 0) {
      result = result.slice(-limit);
    }
    return result;
  }

  clear(): void {
    this.entries = [];
    this.heldLogs = [];
    this.lastSyncRun = null;
  }

  toJSON(): object {
    return {
      entries: this.entries,
      heldLogs: this.heldLogs,
      lastSyncRun: this.lastSyncRun,
    };
  }
}

export const syncDiagnostics = SyncDiagnostics.getInstance();

export function classifySyncError(error: any): { code: string; category: string; resolution: string } {
  const code = error?.code || error?.name || 'UNKNOWN';
  let category = 'Unknown Error';
  let resolution = 'Investigate manually';

  switch (code) {
    case '23503':
      category = 'Foreign Key Violation';
      resolution = 'Parent record missing in remote. Record will be held until parent is pushed.';
      break;
    case '23505':
      category = 'Unique Constraint Violation';
      resolution = 'Duplicate key conflict. Verify uniqueness constraints.';
      break;
    case '42P01':
      category = 'Undefined Table';
      resolution = 'Table missing in Supabase schema. Verify migrations.';
      break;
    case 'PGRST116':
      category = 'No Rows Found';
      resolution = 'Record not found for update or delete. It may have been deleted on the server.';
      break;
    case 'NETWORK':
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'FETCH_ERROR':
    case 'TypeError':
      if (error?.message?.toLowerCase().includes('fetch') || error?.message?.toLowerCase().includes('network')) {
        category = 'Network Error';
        resolution = 'Network connectivity issue. Retry sync when online.';
      }
      break;
    default:
      if (error?.message?.toLowerCase().includes('network')) {
        category = 'Network Error';
        resolution = 'Network connectivity issue. Retry sync when online.';
      }
      break;
  }

  return { code, category, resolution };
}

export function parseFKError(errorMessage: string): { fkTable: string | null; fkColumn: string | null } {
  let fkTable: string | null = null;
  let fkColumn: string | null = null;

  if (!errorMessage) {
    return { fkTable, fkColumn };
  }

  // Match: Key (vehicle_id)=(xxx) is not present in table "vehicles"
  const notPresentMatch = errorMessage.match(/Key \(([^)]+)\)=.* is not present in table "([^"]+)"/i);
  if (notPresentMatch) {
    fkColumn = notPresentMatch[1];
    fkTable = notPresentMatch[2];
    return { fkTable, fkColumn };
  }

  // Match: violates foreign key constraint "outgoing_sales_vehicle_id_fkey"
  const constraintMatch = errorMessage.match(/constraint "([^"]+)"/i);
  if (constraintMatch) {
    const constraintName = constraintMatch[1];
    const fkeyMatch = constraintName.match(/_(.+)_fkey$/i);
    if (fkeyMatch) {
      fkColumn = fkeyMatch[1];
    }
  }

  return { fkTable, fkColumn };
}
