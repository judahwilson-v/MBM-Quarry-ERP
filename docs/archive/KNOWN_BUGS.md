# Known Bugs

## BUG-001
Sales edit flow can regress when stale SQLite files are used.

Status: Mitigated by startup schema repair, but still monitor.
Priority: High
Assigned: Engineering

## BUG-002
Ad hoc root-level test scripts can break build/type-check if reintroduced.

Status: Open
Priority: Medium
Assigned: Engineering

## BUG-003
Electron dev workflow and Supabase sync still need full interactive verification.

Status: Open
Priority: High
Assigned: Engineering
