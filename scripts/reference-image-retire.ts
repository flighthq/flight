export interface RetirableRequestTarget {
  entry: string;
  renderer: string;
  pixelSha256: string;
}

export interface RetirableRequest {
  id: string;
  subject: string;
  targets: readonly RetirableRequestTarget[];
}

export interface ReferenceImageRetirement {
  /** Requests to delete outright: every cell they named is now blessed with exactly the pinned pixels. */
  remove: readonly string[];
  /** Requests to rewrite with the fulfilled targets dropped, keyed by id. */
  rewrite: ReadonlyMap<string, readonly RetirableRequestTarget[]>;
  /** Cells whose blessed image is NOT what the request pinned — reported, never retired. */
  mismatched: readonly string[];
}

/**
 * Decides which open requests the lock has already fulfilled.
 *
 * ★ NOTHING RETIRED A REQUEST ONCE ITS IMAGE WAS BLESSED, AND THE COST WAS INVISIBLE. A cell with an open
 * request is demoted to `pending` and never compared, so a fulfilled-but-unretired request quietly
 * removed its cell from the gate — 74 of them had accumulated, holding blessed cells out of comparison
 * while the run reported green. The expiry that should have caught it cannot: request ages are derived
 * from a date suffix in the id, and these ids are bare UUIDs, so every one reads as 0 days old forever.
 *
 * FULFILLED MEANS THE PINNED PIXELS ARE THE BLESSED PIXELS, not merely that the cell has an image. A cell
 * blessed with something OTHER than what the request asked for is a finding — the queue asked for one
 * picture and a different one landed — so it is reported and left alone rather than swept up as done.
 *
 * Requests are only ever narrowed or removed, never rewritten to claim a cell they did not already name.
 */
export function resolveReferenceImageRetirement(
  open: readonly RetirableRequest[],
  blessedPixelSha256: ReadonlyMap<string, string>,
): ReferenceImageRetirement {
  const remove: string[] = [];
  const rewrite = new Map<string, readonly RetirableRequestTarget[]>();
  const mismatched: string[] = [];

  for (const request of open) {
    const kept: RetirableRequestTarget[] = [];
    for (const target of request.targets) {
      const identity = `${request.subject}/${target.entry}/${target.renderer}`;
      const blessed = blessedPixelSha256.get(identity);
      if (blessed === undefined) {
        kept.push(target);
        continue;
      }
      if (blessed !== target.pixelSha256) {
        mismatched.push(identity);
        kept.push(target);
        continue;
      }
      // Fulfilled: the request asked for these pixels and these pixels are blessed. Drop the target.
    }
    if (kept.length === request.targets.length) continue;
    if (kept.length === 0) remove.push(request.id);
    else rewrite.set(request.id, kept);
  }
  return { remove, rewrite, mismatched };
}
