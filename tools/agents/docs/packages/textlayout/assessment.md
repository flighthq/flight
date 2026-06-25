---
package: '@flighthq/textlayout'
updated: 2026-06-25
basedOn: ./review.md
---

# textlayout — Assessment

Reasoned over `./review.md` (merge gate: `base=origin/main(eb73c3d74)` vs `integration-b2824e3d8` delta). The charter is a stub, so structural forks and the codebase-map AAA standard supply the bar. Cross-package items and design forks are routed to the charter's Open directions, not into Recommended.

## Recommended (sweep-safe, within-package)

- **Drop the vestigial `_text` parameter.** `getRichTextCharBoundaries` and `getRichTextCharIndexAtPoint` (`richTextQuery.ts`) no longer use their `_text` argument after the hit-test fix. Remove the parameter, its JSDoc "kept for backward compatibility" deferral, and update the two callers/tests. Pre-release has no back-compat duty; the deferral comment encodes an obligation that does not exist. Within-package, mechanical.

> Note: the type-surface blocker (missing `TextDirection`/`TextJustification`/`TextLayoutParams` fields/ `TextFormat.listMarker` in `@flighthq/types`) is **not** Recommended here — it is a cross-package fix in `@flighthq/types` and is owned by the integration worker via the dispatch brief, not by a within-package sweep. See Backlog and the Open-directions note.

## Backlog (parked)

- **Land the missing `@flighthq/types` header surface** — _why parked here:_ cross-package. The fix lives in `@flighthq/types` (add `TextDirection`, `TextJustification`, `TextListMarker`; extend `TextLayoutParams` with `direction`/`justification`/`maxLines`/`truncationCharacter`; add `TextFormat.listMarker`), then mirror the seam in `flighthq-types` for the Rust port. textlayout cannot self-fix it. Tracked as the merge blocker in the dispatch brief.
- **Decompose `buildGroups` truncation + list-marker into passes** — _why parked:_ a design decision, not a sweep. Truncation (`checkTruncation`) and bullet emission (`emitBullet`) are config-gated branches inside the hot layout closure; extracting them as post-passes (the way `applyAlignment`/`justifyLines` already are) is the right shape but changes the internal structure and wants a deliberate call. Route to Open directions.
- **Replace the group-boundary justify model with a true inter-word model** — _why parked:_ correctness redesign, not a tweak. Today a single multi-word run (one group) gets no internal expansion. A real model distributes residual across actual inter-word spaces; it intersects the shaper seam (where word/space boundaries live) and is larger than a within-package edit.
- **Modern-typography axis (bidi, UAX #14 line breaking, UAX #29 graphemes, real font metrics)** — _why parked:_ cross-package, gated behind the shaper-seam widening named in the depth review. Out of scope for this delta; noted for completeness.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

- **The text feature seam is split across `@flighthq/types` and `@flighthq/textlayout`, and integration can desync them.** This delta is the cautionary case: the source half merged without the header half, breaking compilation. The charter should state that any `textlayout` feature touching `TextLayoutParams`/`TextFormat` must land its `@flighthq/types` additions in the same integration unit, and that the Rust `flighthq-types` mirror is part of "done" for the seam.
- **Layout-core decomposition.** Should `buildGroups` own truncation and list markers, or should those be passes over the produced groups (like alignment/justification already are)? A direction call on how far to decompose the layout core before it is "bedrock."
- **Justification fidelity target.** How exact must inter-word justification be pre-shaper? The current group-boundary approximation is honest for multi-run text and wrong for plain prose — the charter should set the bar (and whether interCharacter/Kashida are reserved for a later tier, as the prior review assumed).
