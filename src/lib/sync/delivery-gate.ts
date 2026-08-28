/**
 * Per-Model Delivery Mode Gate — Phase 6 Checkpoint 5
 *
 * Controls whether mutations for each sync model are delivered via:
 *   - "legacy": Legacy audit-log / timestamp push (default for all models).
 *               Outbox events remain safely PENDING.
 *   - "shadow": Legacy sync performs cloud mutations while outbox reconciliation
 *               reports mismatches without double-applying cloud mutations.
 *   - "outbox": Cut-over mode. New writes deliver strictly via outbox RPC
 *               (apply_outbox_event); legacy push is inhibited from remotely
 *               mutating the table or performing collision merge renaming.
 *
 * Invariants:
 *   1. Default for ALL 29 models is "legacy".
 *   2. Missing, unknown, or invalid model names fail closed to "legacy".
 *   3. Transitioning to "outbox" strictly requires the model to be CUTOVER_READY
 *      in CUTOVER_MODEL_MANIFEST; non-ready/deferred models throw and fail closed.
 *   4. Reverting the gate to "legacy" or "shadow" immediately halts outbox
 *      deliveries and leaves pending events intact without data loss.
 */

import { SYNC_MODEL_CONFIG, type SyncModelName } from "./sync-config";
import { CUTOVER_MODEL_MANIFEST, assertModelCutoverEligible } from "./cutover-manifest";

export type DeliveryMode = "legacy" | "shadow" | "outbox";

// In-memory gate registry with fail-closed semantics
const _deliveryModes: Partial<Record<SyncModelName, DeliveryMode>> = {};

/**
 * Returns the active delivery mode for a given model.
 * Fail-closed: missing, undefined, or unknown model names always return "legacy".
 */
export function getDeliveryMode(modelName: string): DeliveryMode {
  if (!modelName || !(modelName in SYNC_MODEL_CONFIG)) {
    return "legacy";
  }
  return _deliveryModes[modelName as SyncModelName] ?? "legacy";
}

/**
 * Sets the delivery mode for a single model.
 *
 * Strict validation: Transitioning to "outbox" requires the model to have
 * cutoverReady: true and outboxStatus: "MIGRATED" in CUTOVER_MODEL_MANIFEST.
 * Attempting to cut over a deferred or unverified model throws an error.
 */
export function setDeliveryMode(modelName: SyncModelName, mode: DeliveryMode): void {
  if (!(modelName in SYNC_MODEL_CONFIG)) {
    throw new Error(`[Delivery Gate] Unknown model name: "${modelName}"`);
  }
  if (mode === "outbox") {
    assertModelCutoverEligible(modelName);
  }
  _deliveryModes[modelName] = mode;
}

/**
 * Reset all delivery modes back to default ("legacy").
 */
export function resetDeliveryModes(): void {
  for (const key of Object.keys(_deliveryModes)) {
    delete _deliveryModes[key as SyncModelName];
  }
}

/**
 * Returns true if outbox delivery is active for this model.
 * Only returns true when mode is explicitly "outbox".
 */
export function isOutboxDeliveryEnabled(modelName: SyncModelName): boolean {
  return getDeliveryMode(modelName) === "outbox";
}

/**
 * Returns true if legacy push mutation to the cloud table is permitted for this model.
 * Returns false when the model is in "outbox" mode (preventing duplicate mutations/renaming).
 */
export function isLegacyPushMutationEnabled(modelName: SyncModelName): boolean {
  return getDeliveryMode(modelName) !== "outbox";
}

/**
 * Returns true if legacy pull row-copy is permitted for this model.
 * Returns false when the model is cut over to "outbox" mode (prohibiting unverified legacy overwrite/merging).
 */
export function isLegacyPullRowCopyEnabled(modelName: SyncModelName): boolean {
  return getDeliveryMode(modelName) !== "outbox";
}

/**
 * Returns the current delivery gate status for all 29 models.
 */
export function getAllDeliveryModes(): Record<SyncModelName, DeliveryMode> {
  const result = {} as Record<SyncModelName, DeliveryMode>;
  for (const modelName of Object.keys(SYNC_MODEL_CONFIG) as SyncModelName[]) {
    result[modelName] = getDeliveryMode(modelName);
  }
  return result;
}
