# MBM Quarry ERP — Release Notes

## v0.1.0-rc1 — Release Candidate 1 (2026-06-27)

This is the first feature-complete release candidate of MBM Quarry ERP. The application is stable, packaged as an Electron desktop app, and ready for real-world field testing at the quarry.

### Features Complete
- **Sales**: Vehicle lookup, quantity/rate defaults, split payments (Cash/Bank/GPay), party credit, vehicle trip counting, edit password protection, audit logging.
- **Boulder Purchases**: Incoming boulder register with split payments, vehicle rent, combined payment flag.
- **Party Ledger**: Running debit/credit/balance projection per party.
- **Credit Management**: Party credit, party collections, employee credit, other credit.
- **Expenses**: Expense register with payment mode and party/vehicle references.
- **Reports**: Multi-format reporting, GST summary, Day Book.
- **Masters**: Vehicle, Party, Material master management.
- **Backup Manager**: Create/restore local backups, export `.db`, import `.db`.
- **Settings Page**: Quarry Name, GST Number, Address, Phone, Default Printer, Backup Folder.
- **Cloud Sync**: Offline-first push/pull sync to Supabase.
- **Electron Packaging**: macOS DMG produced. Data persisted safely in OS user-data directory.

### Known Limitations (see `docs/KNOWN_BUGS.md`)
- Windows installer not yet produced.
- Supabase sync requires one-time manual SQL setup.
- Silent printing not yet implemented.
- Auto-updater disabled until quarry validation.

### Next Steps
- Deploy to quarry PC for field testing.
- Collect feedback for 1–2 weeks.
- Fix bugs before Phase 7 (Tally) and Phase 8 (Owner Dashboard).
