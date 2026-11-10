"use server";
import { getSettingsWithSecrets } from "@/lib/settings/internal";

const failedAttempts = new Map<string, { count: number; lockedUntil: number }>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function verifyEditPassword(input: string, type: "edit" | "delete" = "edit") {
  if (!input || typeof input !== "string") return false;

  const now = Date.now();
  const attemptRecord = failedAttempts.get("global") || { count: 0, lockedUntil: 0 };
  
  if (now < attemptRecord.lockedUntil) {
    const mins = Math.ceil((attemptRecord.lockedUntil - now) / 60000);
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }

  const settings = await getSettingsWithSecrets();
  const target = type === "delete" ? settings?.deletePin : settings?.adminPin;
  if (!target) return false; // no fallback/default PIN: unset means refuse
  
  if (input.trim() === target.trim()) {
    failedAttempts.set("global", { count: 0, lockedUntil: 0 });
    return true;
  } else {
    const newCount = attemptRecord.count + 1;
    if (newCount >= MAX_ATTEMPTS) {
      failedAttempts.set("global", { count: newCount, lockedUntil: now + LOCKOUT_MS });
      throw new Error(`Too many failed attempts. Try again in 10 minute(s).`);
    } else {
      failedAttempts.set("global", { count: newCount, lockedUntil: attemptRecord.lockedUntil });
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Worker identity: per-user login with server-derived sessions.
// Credentials are scrypt-hashed (never plaintext, never synced, never logged).
// Attribution comes from the server-resolved session, never from client input.
// ---------------------------------------------------------------------------

import { getDb as getIdentityDb } from "@/lib/prisma";
import { verifyPinHash, newSessionToken, SESSION_TTL_MS, ENROLLMENT_KEY, CONTROL_PRINCIPAL_KEY, isIdentitySetupCompatibilityMode } from "@/lib/identity/service";

const userAttempts = new Map<string, { count: number; lockedUntil: number }>();

function checkUserLockout(key: string) {
  const rec = userAttempts.get(key) || { count: 0, lockedUntil: 0 };
  const now = Date.now();
  if (now < rec.lockedUntil) {
    const mins = Math.ceil((rec.lockedUntil - now) / 60000);
    throw new Error(`Too many failed attempts. Try again in ${mins} minute(s).`);
  }
  return rec;
}

function recordUserFailure(key: string, rec: { count: number; lockedUntil: number }) {
  const newCount = rec.count + 1;
  if (newCount >= MAX_ATTEMPTS) {
    userAttempts.set(key, { count: newCount, lockedUntil: Date.now() + LOCKOUT_MS });
    throw new Error(`Too many failed attempts. Try again in 10 minute(s).`);
  }
  userAttempts.set(key, { count: newCount, lockedUntil: rec.lockedUntil });
}

// Server-side verification for the /admin diagnostics screen. The client
// never receives the expected PIN; it submits an attempt and gets a boolean.
export async function verifyAdminPin(input: string): Promise<boolean> {
  return verifyEditPassword(input, "edit");
}

export async function isEnrollmentComplete(): Promise<boolean> {
  const db = await getIdentityDb();
  const row = await db.appMeta.findUnique({ where: { key: ENROLLMENT_KEY } });
  return row?.value === "true";
}

export type Actor = { id: string; name: string; role: string };

export async function resolveActor(token?: string | null): Promise<Actor | null> {
  if (!token || typeof token !== "string") return null;
  const db = await getIdentityDb();
  const session = await db.authSession.findUnique({ where: { token }, include: { user: true } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  if (!session.user.active) return null;
  return { id: session.user.id, name: session.user.name, role: session.user.role };
}

/**
 * Attribution boundary for mutations. Returns the server-resolved actor, or
 * null only while the install is still in setup (enrollment not completed).
 * Once enrollment is complete a valid session is mandatory: an absent,
 * invalid or expired token refuses the mutation rather than writing
 * unattributed or falsely attributed records.
 */
export async function requireActor(token?: string | null): Promise<Actor | null> {
  const actor = await resolveActor(token);
  if (actor) return actor;
  if (await isEnrollmentComplete()) {
    throw new Error("Your login session is missing or has expired. Please log in again.");
  }
  if (isIdentitySetupCompatibilityMode()) return null;
  throw new Error("Identity enrollment is not configured. Setup is unavailable in this build.");
}

export async function login(name: string, pin: string) {
  try {
    if (!name || !pin) return { success: false as const, message: "Name and PIN are required." };
    const key = name.trim().toLowerCase();
    const rec = checkUserLockout(key);
    const db = await getIdentityDb();
    const user = await db.appUser.findUnique({ where: { name: name.trim() } });
    if (!user || !user.active || !verifyPinHash(pin, user.pinSalt, user.pinHash)) {
      recordUserFailure(key, rec);
      return { success: false as const, message: "Invalid name or PIN." };
    }
    userAttempts.delete(key);
    const token = newSessionToken();
    await db.authSession.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
    });
    return { success: true as const, token, name: user.name, role: user.role };
  } catch (error: any) {
    return { success: false as const, message: error?.message || "Login failed." };
  }
}

export async function logout(token?: string | null) {
  if (!token) return { success: true as const };
  const db = await getIdentityDb();
  await db.authSession.deleteMany({ where: { token } });
  return { success: true as const };
}

// No policy is inferred from role labels or knowing the legacy shared PIN.
// An unconfigured privileged path stays unavailable in this prototype.
export async function requirePrivilegedActor(token?: string | null): Promise<Actor> {
  const actor = await resolveActor(token);
  if (!actor) throw new Error("A valid login session is required for privileged controls.");
  const db = await getIdentityDb();
  const configured = await db.appMeta.findUnique({ where: { key: CONTROL_PRINCIPAL_KEY } });
  if (!configured?.value || configured.value !== actor.id) {
    throw new Error("Privileged controls are not configured for this login. Owner-authorized setup is required.");
  }
  return actor;
}

// Lets the UI decide whether to offer decision controls. Returns false for
// any unresolved/non-principal session and before enrollment; never throws.
export async function amIControlPrincipal(token?: string | null): Promise<boolean> {
  try {
    await requirePrivilegedActor(token);
    return true;
  } catch {
    return false;
  }
}
