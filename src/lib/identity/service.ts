import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

// Worker identity primitives. PINs are stored ONLY as scrypt hashes with a
// per-user salt. Hash, salt and session tokens are local-only secrets: they
// must never be written to audit payloads, sync payloads, logs or evidence.

const KEY_LEN = 32;

export function hashPin(pin: string, saltHex?: string): { hash: string; salt: string } {
  const salt = saltHex ?? randomBytes(16).toString("hex");
  const hash = scryptSync(pin, salt, KEY_LEN).toString("hex");
  return { hash, salt };
}

export function verifyPinHash(pin: string, saltHex: string, expectedHashHex: string): boolean {
  if (!pin || !saltHex || !expectedHashHex) return false;
  const actual = scryptSync(pin, saltHex, KEY_LEN);
  const expected = Buffer.from(expectedHashHex, "hex");
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
export const ENROLLMENT_KEY = "worker_enrollment_completed";

// No UI or server action sets this key in the prototype. An eventual owner-
// authorized enrollment workflow must supply it; first/any user and role labels
// confer no control authority. Synthetic tests seed it directly in their DB.
export const CONTROL_PRINCIPAL_KEY = "owner_authorized_control_principal_id";

export function isIdentitySetupCompatibilityMode(): boolean {
  return process.env.NODE_ENV === "development" ||
    (process.env.NODE_ENV !== "production" && !!process.env.MBM_TEST_ROOT);
}
