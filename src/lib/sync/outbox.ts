import { randomUUID } from "crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { getDb } from "@/lib/prisma";
import { createSyncClient } from "@/lib/supabase/client-sync";
import { withSyncLease } from "./sync-lease";
import { type SyncModelName } from "./sync-config";
import SYNC_MAP from "./sync-map.json";

import { isOutboxDeliveryEnabled } from "./delivery-gate";

type DeviceIdentityClient = Pick<PrismaClient, "deviceIdentity"> | Prisma.TransactionClient;
type OutboxClient = Pick<PrismaClient, "deviceIdentity" | "syncOutboxEvent"> | Prisma.TransactionClient;

export type OutboxOperation = "create" | "update" | "delete";

export type OutboxEventInput = {
  entityType: SyncModelName;
  entityId: string;
  operation: OutboxOperation;
  payload: unknown;
};

function serializeOutboxPayload(entityType: SyncModelName, payload: unknown): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error(`Outbox payload for ${entityType} must be an entity object.`);
  }
  const model = Prisma.dmmf.datamodel.models.find((candidate) => candidate.name === entityType);
  if (!model) throw new Error(`Unknown outbox entity type: ${entityType}`);
  const scalarFields = new Set(model.fields.filter((field) => field.kind === "scalar").map((field) => field.name));
  const mapping = SYNC_MAP[entityType] as Record<string, string> | undefined;
  if (!mapping) throw new Error(`Missing column mapping for outbox entity type: ${entityType}`);
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!scalarFields.has(key)) throw new Error(`Outbox payload for ${entityType} contains unsupported field: ${key}`);
    converted[mapping[key] ?? key] = value;
  }
  if (converted.id === undefined) throw new Error(`Outbox payload for ${entityType} is missing id.`);
  return JSON.stringify(converted);
}

/**
 * Return the installation's durable identity. The singleton row is created in
 * the caller's transaction, so a business mutation can never be paired with an
 * outbox event from an uncommitted or different device identity.
 */
export async function getOrCreateDeviceId(db: DeviceIdentityClient): Promise<string> {
  const existing = await db.deviceIdentity.findUnique({ where: { id: "default" } });
  if (existing) return existing.deviceId;

  const deviceId = randomUUID();
  try {
    const created = await db.deviceIdentity.create({ data: { id: "default", deviceId } });
    return created.deviceId;
  } catch (error: any) {
    // Concurrent startup can race on the singleton. Re-read rather than ever
    // generating a different identity for this database.
    if (error?.code === "P2002") {
      const raced = await db.deviceIdentity.findUnique({ where: { id: "default" } });
      if (raced) return raced.deviceId;
    }
    throw error;
  }
}

/**
 * Append an immutable delivery record inside the same transaction as the
 * business mutation. Callers must not reuse or mutate an event after enqueue.
 */
export async function enqueueOutboxEvent(db: OutboxClient, input: OutboxEventInput) {
  const deviceId = await getOrCreateDeviceId(db);
  return db.syncOutboxEvent.create({
    data: {
      eventId: randomUUID(),
      deviceId,
      entityType: input.entityType,
      entityId: input.entityId,
      operation: input.operation,
      payload: serializeOutboxPayload(input.entityType, input.payload),
    },
  });
}

type OutboxRemote = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: boolean | null; error: { message: string } | null }>;
};

export type OutboxDeliveryResult = { attempted: number; delivered: number; errors: string[] };

/**
 * Deliver the Party pilot only. An event is marked ACKED only after the remote
 * transaction succeeds; a process interruption leaves SENDING, which the next
 * run safely reclaims because the cloud's event_id deduplicates it.
 */
export async function deliverPendingOutbox(
  dependencies: { db?: PrismaClient; remote?: OutboxRemote; afterRemoteApply?: () => Promise<void>; ignoreGate?: boolean } = {},
): Promise<OutboxDeliveryResult> {
  return withSyncLease("outbox_delivery", async () => {
    const db = dependencies.db ?? await getDb();
    const remote = dependencies.remote ?? createSyncClient();
    const errors: string[] = [];
    let attempted = 0;
    let delivered = 0;

    await db.syncOutboxEvent.updateMany({
      where: { status: "SENDING" },
      data: { status: "PENDING", lastError: "Recovered after interrupted delivery; retrying." },
    });
    const pending = await db.syncOutboxEvent.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

    for (const event of pending) {
      if (!dependencies.ignoreGate && !isOutboxDeliveryEnabled(event.entityType as SyncModelName)) {
        continue;
      }
      attempted++;
      await db.syncOutboxEvent.update({ where: { id: event.id }, data: { status: "SENDING", lastError: null } });
      try {
        const payload = JSON.parse(event.payload) as Record<string, unknown>;
        if (payload.id !== event.entityId) throw new Error("Outbox payload ID does not match its entity ID.");
        const { error } = await remote.rpc("apply_outbox_event", {
          p_event_id: event.eventId,
          p_device_id: event.deviceId,
          p_entity_type: event.entityType,
          p_entity_id: event.entityId,
          p_operation: event.operation,
          p_payload: payload,
        });
        if (error) throw new Error(error.message);
        await dependencies.afterRemoteApply?.();
        await db.syncOutboxEvent.update({
          where: { id: event.id },
          data: { status: "ACKED", deliveredAt: new Date(), lastError: null },
        });
        delivered++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${event.eventId}: ${message}`);
        await db.syncOutboxEvent.update({
          where: { id: event.id },
          data: { status: "PENDING", attempts: { increment: 1 }, lastError: message },
        });
      }
    }
    return { attempted, delivered, errors };
  });
}

/** @deprecated Party-only pilot compatibility alias. */
export async function deliverPendingPartyOutbox(
  dependencies: { db?: PrismaClient; remote?: OutboxRemote; afterRemoteApply?: () => Promise<void>; ignoreGate?: boolean } = {},
): Promise<OutboxDeliveryResult> {
  return deliverPendingOutbox({ ignoreGate: true, ...dependencies });
}

