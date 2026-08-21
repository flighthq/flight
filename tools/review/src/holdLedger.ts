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

  // ★ RE-HOLDING A RELEASED CELL IS ALLOWED, AND THE RATCHET LIVES IN THE RECORD INSTEAD OF IN A REFUSAL.
  // This used to throw: a release was treated as final, so a cell released once could never be held
  // again. The rule it was enforcing — "removing a hold is a ratchet" — is about not letting a release be
  // undone QUIETLY, not about forbidding a later hold outright. Holding again is an ordinary new decision
  // made on new information, and in practice the refusal fired on exactly that: hold, undo, hold again,
  // blocked with no way forward but hand-editing the ledger.
  //
  // What the ratchet actually needs is that the reversal be VISIBLE, and history gives that: every hold
  // and release is appended with actor, timestamp and reason, so a cell that was released and later
  // re-held reads as the sequence it was. Nothing is lost by allowing the write; what would be lost is
  // the audit trail, and that is kept.

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
