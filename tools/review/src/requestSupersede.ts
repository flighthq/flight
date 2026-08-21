export interface ReviewSupersedableRequest {
  id: string;
  subject: string;
  targets: readonly { entry: string; renderer: string }[];
}

export interface ReviewSupersedeResult {
  /** Requests to delete outright: every cell they claimed is claimed by the incoming one. */
  remove: readonly string[];
  /** Requests to rewrite with the overlapping targets dropped, keyed by id. */
  rewrite: ReadonlyMap<string, readonly { entry: string; renderer: string }[]>;
}

/**
 * Decides what an incoming commission supersedes.
 *
 * ★ RE-COMMISSIONING IS THE NORMAL WORKFLOW AND USED TO PRODUCE A CI FAILURE. Nothing on the write path
 * looked at the queue: the handler minted a fresh id and wrote a second file, so a cell commissioned
 * twice ended up claimed by two open requests and `request-overlap` failed the run. The UI hid this most
 * of the time by disabling the button on `Request pending` — but that state is client-side, so a page
 * reload between the two clicks, a second tab, or the CLI writer all walked straight past it. Ten
 * duplicates accumulated that way, and clearing them was ten files deleted by hand.
 *
 * A re-commission REPLACES the pin it stands on, so the older claim on those exact cells is retired
 * here, at the moment the newer one is written. Requests are only ever narrowed or removed — never
 * rewritten to claim something new — so a request covering four cells of which one is superseded keeps
 * its other three rather than losing them to a re-commission of their sibling.
 */
export function resolveReviewRequestSupersede(
  incomingSubject: string,
  incomingCells: readonly { entry: string; renderer: string }[],
  open: readonly ReviewSupersedableRequest[],
): ReviewSupersedeResult {
  const claimed = new Set(incomingCells.map((cell) => `${incomingSubject}/${cell.entry}/${cell.renderer}`));
  const remove: string[] = [];
  const rewrite = new Map<string, readonly { entry: string; renderer: string }[]>();

  for (const request of open) {
    const kept = request.targets.filter(
      (target) => !claimed.has(`${request.subject}/${target.entry}/${target.renderer}`),
    );
    if (kept.length === request.targets.length) continue;
    if (kept.length === 0) remove.push(request.id);
    else rewrite.set(request.id, kept);
  }
  return { remove, rewrite };
}
