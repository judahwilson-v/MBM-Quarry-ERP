"use server";
import { getGlobalSettings } from "@/app/actions/settings";

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

  const settings = await getGlobalSettings();
  const defaultTarget = type === "delete" ? "7711" : "8888";
  const target = (type === "delete" ? settings?.deletePin : settings?.adminPin) || defaultTarget;
  
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
