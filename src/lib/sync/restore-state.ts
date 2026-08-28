let restoreInProgress = false;

export function assertRestoreIsNotInProgress() {
  if (restoreInProgress) throw new Error("A database restore is in progress. Try again after it completes.");
}

export function beginRestore() {
  if (restoreInProgress) return false;
  restoreInProgress = true;
  return true;
}

export function endRestore() {
  restoreInProgress = false;
}
