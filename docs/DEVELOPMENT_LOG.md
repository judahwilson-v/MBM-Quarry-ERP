# MBM development log

## 2026-11-10 - Review candidate, not a release

This branch records source changes and their evidence while the existing
production branch stays unchanged. It is not a claim that the desktop,
website, Android client or live backend is ready for use.

### Why these changes exist

The desktop app keeps local records and synchronizes them to a shared
backend. The private owner website reads saved cloud records and needs a
safe way to send approval decisions back to the desktop. The Android
client also reads the shared backend. These are separate clients, not
interchangeable copies of one app.

### Changes in this review

- Keep accounting and correction history visible. Preserve existing book
  and slip entry, the updater, and recorded transactions.
- Bind vehicle CSV commits to the exact preview, login, file and reviewed
  values. Refuse stale previews without partial writes. Show file/header
  errors immediately and require explicit conflict choices.
- Require stable, explicitly provisioned website membership. Profile names
  and email text are not approval authority. Close the old customer-phone
  demonstration route.
- Submit approvals as queued decisions. The desktop checks local authority,
  self-approval rules and the original record before applying a change.
  Show the actual terminal result, including refusal or conflict, rather
  than claiming that queue submission means the change was applied.
- Keep saved-cloud and unavailable states honest. Preserve exact money
  handling, quarry-day date rules, bounded pagination and read errors.
- Prepare an injected, disabled-by-default approval transport. Runtime
  installation, provider permissions and real-client acceptance remain open.

### Source and test status

This is reconstructed review source, using the pinned earlier repositories,
retained source snapshots and recovered edits. It is not the original lost
candidate archive, and previous test passes do not automatically apply.

Fresh local checks on the reconstructed code:

- Vehicle-import recovery: 38 focused independent checks, production build,
  types and actual import/error UI passed in a separate focused review.
- Owner read contract: 25 checks in each of UTC, Asia/Kolkata and
  America/Los_Angeles, 75 executions passed.
- Approval bridge: 40 test executions passed across three isolated files:
  14 authored cases, 22 retained cases (14 overlap plus 8 independent),
  and four provider-contract/disabled-runner cases. Each file uses its own
  fresh synthetic SQLite database with blocked networking. This is not
  40 distinct cases.
- Website action and middleware gates: 14 checks passed.
- Both type checks passed. Both production builds passed during recovery;
  the final packaged source still needs its own reconciliation and review.

The wildcard test entry point previously shared identity fixture names across
files. The isolated runner now creates a fresh database for every test file.
Run `unshare -Urn node tests/website-bridge/runner.mjs` from the ERP root;
the config refuses to run without that fixture setup. No tests were removed.

The retained bridge test queue previously broke equal-time ties using random
IDs, which could move its claimed head. The test stand-in now assigns stable
sequence numbers like the provider contract. Production code continues to
use provider sequence order and stops at an occupied queue head.

These are local or mocked checks. They do not prove live authentication,
direct API privacy, provider claims, client synchronization or deployment.
A live backend test matrix and one real authorized round trip are still
required. The Android client needs authenticated-access compatibility work;
anonymous cloud reads are not an acceptable substitute.

### Known boundaries and next steps

1. Reconcile the complete source overlay against each pinned baseline and
   independently inspect the affected website and bridge UI.
2. Test actual backend allowed/denied access, identity mapping, offline
   recovery, claim expiry, fenced acknowledgments and terminal replay.
3. Install the bridge only after those checks pass, then verify the actual
   desktop, website and Android paths.
4. Make a separate release/deployment decision. This review branch does not
   update production, publish an installer or change the main branch.

No company records, credentials, private operational details or supplied
vehicle lists are added by this review. Existing repository history is not
rewritten or certified sanitized by this update. Commits record real progress; they do not imply a
particular contribution-graph result.
