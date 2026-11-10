"use server";

import { getDb } from "@/lib/prisma";
import { verifyEditPassword, isEnrollmentComplete, requirePrivilegedActor } from "@/app/actions/auth";
import { writeAuditEvent } from "@/lib/domain";
import { ENROLLMENT_KEY, CONTROL_PRINCIPAL_KEY, hashPin, isIdentitySetupCompatibilityMode } from "@/lib/identity/service";

// User changes after development/test bootstrap require a configured
// owner-authorized control principal, a valid session, and the admin PIN.
// No role label or shared PIN grants authority. The prototype has no real
// principal-enrollment action; unconfigured control paths stay unavailable.
// New user PINs are scrypt-hashed and omitted from audit/sync/returns.
async function requireControl(pin: string | undefined, sessionToken: string | undefined) {
  const actor = await requirePrivilegedActor(sessionToken);
  if (!actor) throw new Error("A valid login session is required to manage users.");
  if (!pin || !(await verifyEditPassword(pin))) {
    throw new Error("Admin PIN is required to manage users.");
  }
  return actor;
}

export async function listUsers() {
  const db = await getDb();
  const users = await db.appUser.findMany({ orderBy: { createdAt: "asc" } });
  return users.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active, createdAt: u.createdAt }));
}

export async function saveUser(input: { name: string; pin: string; role?: string }, adminPin?: string, sessionToken?: string) {
  try {
    // Bootstrap: the first-ever user (install still in setup mode, enrollment
    // not complete) needs no admin PIN or session - there is nobody who could
    // hold one yet. After enrollment every user change requires a validated
    // session AND the admin PIN.
    let actorName = "system";
    if (await isEnrollmentComplete()) {
      actorName = (await requireControl(adminPin, sessionToken)).name;
    } else if (!isIdentitySetupCompatibilityMode()) {
      throw new Error("Owner-authorized enrollment is not configured in this build.");
    }
    const name = input.name?.trim();
    if (!name) throw new Error("Name is required.");
    if (!input.pin || input.pin.length < 4) throw new Error("PIN must be at least 4 digits.");
    const role = input.role === "approver" ? "approver" : "worker";
    const db = await getDb();
    const { hash, salt } = hashPin(input.pin);
    const user = await db.$transaction(async (tx) => {
      const existing = await tx.appUser.findUnique({ where: { name } });
      if (existing) throw new Error("A user with this name already exists.");
      const row = await tx.appUser.create({ data: { name, pinHash: hash, pinSalt: salt, role } });
      // First enrolled user closes setup mode permanently. This flag is
      // persistent enrollment state: deactivating or deleting every user
      // later must never reopen unauthenticated writes.
      await tx.appMeta.upsert({ where: { key: ENROLLMENT_KEY }, update: { value: "true" }, create: { key: ENROLLMENT_KEY, value: "true" } });
      // Audit WITHOUT any credential material.
      await writeAuditEvent(tx, { entityName: "AppUser", entityId: row.id, action: "create", role: actorName, after: { id: row.id, name: row.name, role: row.role, active: row.active } });
      return row;
    });
    return { success: true as const, id: user.id, name: user.name, role: user.role };
  } catch (error: any) {
    return { success: false as const, message: error?.message || "Could not save user." };
  }
}

export async function resetUserPin(id: string, newPin: string, adminPin?: string, sessionToken?: string) {
  try {
    const actor = await requireControl(adminPin, sessionToken);
    if (!newPin || newPin.length < 4) throw new Error("PIN must be at least 4 digits.");
    const db = await getDb();
    const { hash, salt } = hashPin(newPin);
    await db.$transaction(async (tx) => {
      const user = await tx.appUser.findUnique({ where: { id } });
      if (!user) throw new Error("User not found.");
      await tx.appUser.update({ where: { id }, data: { pinHash: hash, pinSalt: salt } });
      // Server-enforced: a PIN reset ends all existing sessions for the user.
      await tx.authSession.deleteMany({ where: { userId: id } });
      await writeAuditEvent(tx, { entityName: "AppUser", entityId: id, action: "update", role: actor.name, after: { id, name: user.name, pinReset: true } });
    });
    return { success: true as const };
  } catch (error: any) {
    return { success: false as const, message: error?.message || "Could not reset PIN." };
  }
}

export async function setUserActive(id: string, active: boolean, adminPin?: string, sessionToken?: string) {
  try {
    const actor = await requireControl(adminPin, sessionToken);
    const db = await getDb();
    await db.$transaction(async (tx) => {
      const user = await tx.appUser.findUnique({ where: { id } });
      if (!user) throw new Error("User not found.");
      if (!active) {
        const principal = await tx.appMeta.findUnique({ where: { key: CONTROL_PRINCIPAL_KEY } });
        if (principal?.value === id) {
          throw new Error("Cannot deactivate the configured control identity. Owner-authorized recovery is not configured.");
        }
        // Deactivating the last active user would lock out all privileged
        // control (and must never reopen setup mode). Refuse it outright.
        const others = await tx.appUser.count({ where: { active: true, NOT: { id } } });
        if (user.active && others === 0) throw new Error("Cannot deactivate the last active user.");
      }
      await tx.appUser.update({ where: { id }, data: { active } });
      if (!active) {
        // Server-enforced: deactivation ends all of the user's sessions.
        // The enrollment flag is deliberately untouched: removing the last
        // active user must not reopen unauthenticated writes.
        await tx.authSession.deleteMany({ where: { userId: id } });
      }
      await writeAuditEvent(tx, { entityName: "AppUser", entityId: id, action: "update", role: actor.name, before: { active: user.active }, after: { id, name: user.name, active } });
    });
    return { success: true as const };
  } catch (error: any) {
    return { success: false as const, message: error?.message || "Could not update user." };
  }
}
