# MBM development log

## 2026-11-11 03:01 IST - Blocked state unchanged

No implementation, test or live-effect change this hour. Private source/evidence remain preserved. Human setup, deployment/install scope, provider HTTP/business-roundtrip proof and coherent source publication remain unresolved. This updates the log only, not readiness or live acceptance.


## 2026-11-11 02:01 IST - Integration still blocked

No implementation, test or live-effect change this hour. Private source/evidence remain preserved. Human setup, deployment/install scope, provider HTTP/business-roundtrip proof and coherent source publication remain unresolved. Log-only checkpoint; no new readiness claim.


## 2026-11-11 01:01 IST - No implementation change

Private source and evidence remain preserved. No new code, tests or live effects this hour. Human setup, deployment/install scope, provider HTTP/business-roundtrip proof and coherent source publication remain unresolved. This checkpoint changes the log only and adds no readiness claim.


## 2026-11-11 00:00 IST - Blocked state retained

No new implementation, tests or live effects since the previous checkpoint. Private source/evidence remain preserved; human setup, deployment/install scope, provider HTTP/business-roundtrip proof and coherent source publication remain unresolved. Log-only update, with no added readiness or live-acceptance claim.


## 2026-11-10 23:00 IST - No change to blocked integration

No new implementation, tests or live effects this hour. Private source and evidence remain preserved. Human setup, deployment/install scope, provider HTTP/business-roundtrip proof and coherent source publication remain unresolved. Log-only update; no new readiness claim.


## 2026-11-10 22:00 IST - Blocked state unchanged

No implementation or test change this hour. The private, locally tested owner-login checkpoint remains preserved. Human setup, deployment/install scope, provider HTTP/business-roundtrip proof and faithful coherent source publication remain unresolved. No provider probes, account changes, deployment or installation were attempted. This is a log-only checkpoint, not new readiness or live acceptance.


## 2026-11-10 20:59 IST - No implementation change; integration still blocked

No new source changes, tests, deployments or installations since the previous checkpoint. The completed private owner-login preparation and its local evidence remain the latest candidate; no live or installed acceptance is added by this note.

The remaining conditions are unchanged: approved human identity setup, deployment/install target and scope, provider HTTP and authorized business-roundtrip proof, and a faithful coherent source-publication route. No additional features or repeated provider probes were run while these conditions remain unresolved. This commit updates the technical log only.


## 2026-11-10 19:59 IST - Private owner-login checkpoint complete within local limits

- Fixed the actual website sign-out caller and per-device session cleanup. Cookie pages and bearer endpoints now share configured-owner and matching active-principal checks. Focused independent web review accepted these changes.
- Fresh website checks passed: 19 authentication/logout cases, 15 approval/cookie-gate cases, TypeScript and production build. The existing 25 read-contract checks also passed before the final gate-only change. An additional independent bearer-denial probe is separate from these authored counts.
- The current Android source compiled and passed eight unit tests. Token preferences are excluded from cloud backup, device transfer and legacy backup; undecryptable or partial token state clears to signed out in tests. Current login and unavailable-dashboard images were inspected. These are local tests, not installed-device or live-login proof.
- Saved and verified a coherent private source/evidence checkpoint and archived completed focused reviews. No new code, deployment, installer or real-person account setup was published in this hour.
- Integration remains blocked on approved human identity setup, deployment/install scope, provider HTTP and business-roundtrip proof, and a faithful coherent source-publication route. No speculative features or repeated provider probes were added while these conditions remain unresolved.


## 2026-11-10 18:59 IST - Private login work and recovery checkpoint

- Prepared private website and Android owner-login changes using ordinary authentication, active membership checks, encrypted mobile session tokens and unavailable states instead of invented figures.
- The unpublished candidate was lost during an execution outage. Earlier reviewed source, backend work and both published review branches were preserved.
- Recovered the authored login slice over pinned baselines and saved a private, hash-verified source checkpoint before resuming builds. This is recovery source, not independent acceptance or an installed release.
- After recovery, the website passed 14 login checks, 14 retained approval checks, 25 read-contract checks, TypeScript and a production build. These are local checks, not a live client roundtrip.
- Android verification, fresh UI checks and independent review remain pending. No deployment, installation, real-person login setup or new code publication is claimed.


## 2026-11-10 - Phase 2.1: ERP cloud-login session reuse, not installed

### Change prepared

The private ERP candidate now reuses one authenticated cloud session per
server process instead of signing in on every sync check. Concurrent callers
share the same login. The server verifies the expected technical account at
login and at most 60 seconds later on the next use. A configuration change,
failed verification or explicit shutdown stops the old refresh loop and
clears its local session. Repeated failures have a 30-second retry delay.
There is no administrative-key or anonymous fallback.

### Checks passed

- Independent review verified the complete source overlay and preservation
  of the earlier private identity and restore changes, except the intended
  login factory change.
- Twenty focused checks and 42 retained/adapted bridge-test executions passed.
  These counts overlap with earlier work and are not 62 unique new cases.
- Two added independent checks covered an unresolved concurrent login,
  queued cleanup/replacement, module reload and account-ID replacement.
  The extended focused suite passed 22 checks. Type checks passed.
- An actual ordinary-authentication probe used 20 concurrent calls and six
  sequential reuses. All returned the same client, with one login request
  and one server user-verification request. Initial login took about
  1.55 seconds; the immediate reuses took less than 0.06 milliseconds each.
  The probe then stopped refresh and cleared its local session.

### Still untested or unfinished

This is a private source checkpoint, not an installed update or a completed
Phase 2. It has not proved long-duration token refresh, installed-device
behavior, business-data synchronization or the full approval round trip.
A reused client reference is not forcibly revoked; provider access rules
remain authoritative. The Data API remains disabled while HTTP access
verification is unfinished.

Next: provision the approved logins privately, connect the ERP and owner
clients, verify allowed and denied access, and test a full sale, correction,
owner decision and ERP update with balances and offline/reconnect checks.
Installation, public source updates and deployment need separate approval.

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


## 2026-11-11 04:02 IST - hourly checkpoint

No implementation change this hour. Private V4 source and bounded local evidence remain preserved; live/deployment/install acceptance is not established. Human owner setup, authorized live fixture/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. Review deployment guard remains disabled; this checkpoint changes only this log.


## 2026-11-11 05:02 IST - hourly checkpoint

No code, test or live-effect change this hour. Private V4 source and bounded evidence remain preserved. Human owner setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No provider probes or repeated tests were run. This log-only checkpoint adds no live-readiness claim.


## 2026-11-11 06:02 IST - hourly checkpoint

No implementation, tests or live-effect change this hour. Private source and bounded evidence remain preserved. Human owner setup, live fixture/access scope, deployment/install targets and coherent source publication remain unresolved. No repeated provider probes or tests. This checkpoint changes the log only and does not establish live readiness.


## 2026-11-11 07:03 IST - hourly checkpoint

No implementation, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, live fixture/access scope, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes were run. This is a log-only checkpoint, not new live-readiness proof.


## 2026-11-11 08:03 IST - hourly checkpoint

No code, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain unresolved. No repeated tests or provider probes. This checkpoint changes only the log, not readiness or live acceptance.


## 2026-11-11 09:03 IST - hourly checkpoint

No implementation, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This log-only checkpoint adds no live-readiness or installation claim.


## 2026-11-11 10:04 IST - hourly checkpoint

No code, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain unresolved. No repeated tests or provider probes. This log-only checkpoint adds no readiness or live-acceptance claim.


## 2026-11-11 11:04 IST - hourly checkpoint

No implementation, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint changes the log only and adds no live-readiness claim.


## 2026-11-11 12:04 IST - hourly checkpoint

No implementation, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint changes the log only, not readiness or live acceptance.


## 2026-11-11 13:05 IST - hourly checkpoint

No implementation, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates the log only and adds no live-readiness claim.


## 2026-11-11 14:05 IST - hourly checkpoint

No code, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates the log only, not readiness or live acceptance.


## 2026-11-11 15:05 IST - hourly checkpoint

No implementation, test or live-effect change this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint changes the log only and adds no live-readiness claim.


## 2026-11-11 16:05 IST - hourly checkpoint

No code, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates the log only and adds no live-readiness claim.


## 2026-11-11 17:06 IST - hourly checkpoint

No implementation, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint changes only the log and adds no live-readiness claim.


## 2026-11-11 18:06 IST - hourly checkpoint

No code, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates only the log, not readiness or live acceptance.


## 2026-11-11 19:06 IST - hourly checkpoint

No implementation, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint changes only the log and adds no live-readiness claim.


## 2026-11-11 21:07 IST - hourly checkpoint

No implementation, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. The 20:07 checkpoint was preserved privately after the GitHub editor failed to load; it was not published that hour. This checkpoint changes only the log and adds no live-readiness claim.


## 2026-11-11 22:07 IST - hourly checkpoint

No code, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates only the log and adds no live-readiness claim.


## 2026-11-12 00:08 IST - hourly checkpoint

No implementation, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. The November 11 23:08 checkpoint was preserved privately after the GitHub editor failed to load; it was not published that hour. This checkpoint changes only the log and adds no live-readiness claim.


## 2026-11-12 01:08 IST - hourly checkpoint

No code, tests or live effects changed this hour. Private source and bounded evidence remain preserved. Human setup, authorized live fixtures/access, deployment/install targets and coherent source publication remain gated. No repeated tests or provider probes. This checkpoint updates only the log and adds no live-readiness claim.
