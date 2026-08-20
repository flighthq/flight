/**
 * Serialises the per-cell approval marks so they survive a page reload.
 *
 * ★ THE MARKS USED TO LIVE ONLY IN A MODULE-LEVEL Map, AND THE DEV SERVER RELOADS THE PAGE ON EVERY
 * CAPTURE. `configureServer` sends a `full-reload` whenever a `screenshot.png`, a `status.json` or the
 * tolerance manifest changes — which is to say, every time the reviewer does the thing they are there to
 * do. The marks vanished with no message. That alone would only have been annoying; what made it a
 * defect is `selectReviewCommissionCells`, where NO MARKS MEANS ALL CELLS. So a reload between marking
 * and committing did not commission nothing, it commissioned everything — including the cells the
 * reviewer had deliberately left unmarked, which is the one outcome marking exists to prevent.
 *
 * Keys are already `tool/name/renderer`, so they are test-scoped by construction and a stored mark can
 * only ever re-apply to the cell it was made on. Session-scoped storage is deliberate: marks are a
 * working set for one sitting, not a durable record — the durable records are the request queue and the
 * hold ledger, both of which are files.
 */
export function parseReviewApprovals(raw: string | null): Map<string, boolean> {
  const approvals = new Map<string, boolean>();
  if (raw === null || raw === '') return approvals;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Unreadable storage is an empty working set, never a crash on load: the reviewer can re-mark, and
    // there is nothing here worth refusing to start the tool over.
    return approvals;
  }
  if (!Array.isArray(parsed)) return approvals;
  for (const entry of parsed) {
    // Only `true` is stored — an unmarked cell is an absent key, not a `false` one, because
    // `selectReviewCommissionCells` distinguishes "no marks at all" from "marked and denied".
    if (typeof entry === 'string' && entry.length > 0) approvals.set(entry, true);
  }
  return approvals;
}

export function serializeReviewApprovals(approvals: ReadonlyMap<string, boolean>): string {
  const marked: string[] = [];
  for (const [key, value] of approvals) {
    if (value) marked.push(key);
  }
  marked.sort();
  return JSON.stringify(marked);
}
