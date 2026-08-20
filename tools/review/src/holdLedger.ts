export interface ReviewHoldHistoryEntry {
  action: 'hold' | 'release';
  actor: string;
  at: string;
  keys: string[];
  reason: string;
  /** Preserves the reasons that disappeared from the active set when a hold was released. */
  priorReasons?: Record<string, string>;
}

export interface ReviewHoldLedger {
  $comment?: string;
  schemaVersion?: number;
  held: Record<string, string>;
  history?: ReviewHoldHistoryEntry[];
}

function requireText(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${label} must not be empty`);
  return trimmed;
}

function requireKeys(keys: readonly string[]): string[] {
  const unique = [...new Set(keys.map((key) => key.trim()))];
  if (unique.length === 0 || unique.some((key) => key.length === 0)) {
    throw new Error('at least one non-empty cell key is required');
  }
  return unique;
}

function appendHistory(ledger: ReviewHoldLedger, entry: ReviewHoldHistoryEntry): void {
  ledger.schemaVersion = 2;
  (ledger.history ??= []).push(entry);
}

/** Adds active holds and an attribution record in one mutation. */
export function recordReviewHolds(
  ledger: ReviewHoldLedger,
  keys: readonly string[],
  actor: string,
  reason: string,
  at: string,
): string[] {
  const normalizedKeys = requireKeys(keys);
  const normalizedActor = requireText(actor, 'hold actor');
  const normalizedReason = requireText(reason, 'hold reason');
  const normalizedAt = requireText(at, 'hold timestamp');

  for (const key of normalizedKeys) ledger.held[key] = normalizedReason;
  appendHistory(ledger, {
    action: 'hold',
    actor: normalizedActor,
    at: normalizedAt,
    keys: normalizedKeys,
    reason: normalizedReason,
  });
  return normalizedKeys;
}

/** Removes active holds only after preserving who released them, why, and what they replaced. */
export function recordReviewHoldReleases(
  ledger: ReviewHoldLedger,
  keys: readonly string[],
  actor: string,
  reason: string,
  at: string,
): string[] {
  const normalizedKeys = requireKeys(keys);
  const normalizedActor = requireText(actor, 'release actor');
  const normalizedReason = requireText(reason, 'release reason');
  const normalizedAt = requireText(at, 'release timestamp');
  const missing = normalizedKeys.filter((key) => ledger.held[key] === undefined);
  if (missing.length > 0) throw new Error(`cell is not held: ${missing.join(', ')}`);

  const priorReasons = Object.fromEntries(normalizedKeys.map((key) => [key, ledger.held[key]!]));
  for (const key of normalizedKeys) delete ledger.held[key];
  appendHistory(ledger, {
    action: 'release',
    actor: normalizedActor,
    at: normalizedAt,
    keys: normalizedKeys,
    priorReasons,
    reason: normalizedReason,
  });
  return normalizedKeys;
}
