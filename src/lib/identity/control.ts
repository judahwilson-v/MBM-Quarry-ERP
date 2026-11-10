// Control-plane authorization boundary for restore, backup, database and
// admin diagnostic entrypoints. This is the server-side gate for operations
// that can replace, export or inspect the whole database.
//
// Policy (same boundary as the worker-identity prototype):
// - Enrollment complete: only the configured owner-authorized control
//   principal with a valid, unexpired session may proceed. A shared legacy
//   PIN, a role label, or any other logged-in worker never grants control
//   authority.
// - Setup mode (enrollment not completed): control operations are allowed
//   only in development/test compatibility mode, where no enrolled identity
//   exists yet. A production build without completed enrollment refuses.
import { isEnrollmentComplete, requirePrivilegedActor, type Actor } from "@/app/actions/auth";
import { isIdentitySetupCompatibilityMode } from "./service";

export async function requireControlActor(sessionToken?: string | null): Promise<Actor | null> {
  let enrolled: boolean;
  try {
    enrolled = await isEnrollmentComplete();
  } catch {
    // The identity tables are unreachable (e.g. database file not created
    // yet). Refuse cleanly rather than leaking a raw driver error upward.
    throw new Error("Control operations are unavailable until the database is initialized.");
  }
  if (enrolled) {
    return requirePrivilegedActor(sessionToken);
  }
  if (isIdentitySetupCompatibilityMode()) return null;
  throw new Error("Identity enrollment is not configured. Control operations are unavailable in this build.");
}
