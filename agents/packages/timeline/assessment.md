---
package: '@flighthq/timeline'
updated: 2026-07-31
basedOn: ./review.md
---

# timeline — Assessment

Sorted from the 2026-07-13 review (solid — 68/100). The 2026-06-25 merge-gate blockers are resolved (types-first fixed), the movieclip extraction landed (`75c4076b`), and the 2026-07-31 sweep completed the remaining four charter-decided items. What remains is playback depth parked on open directions.

## Recommended

_None. The 2026-07-31 sweep completed every charter-decided item; remaining work needs a direction or crosses package boundaries._

## Backlog

Parked — with the reason each is not sweep-safe.

- **Play ranges / reverse / direction / speed / ping-pong.** _Open direction (charter Boundaries: "future direction/speed/ranges as open design")._ The largest depth gap; extends `advanceFrame` and `TimelinePlayMode`. Needs a design pass before implementation.
- **Time addressing (`getTimelineDuration`, seek-by-time, normalized progress).** _Open design._ Requires deciding the time model for `frameRate: null` sources (null sentinel vs undefined behavior) — motion-design/scrubbing consumers hinge on it.
- **Goto-with-unknown-label throw → sentinel + `enableTimelineGuards`.** _Open direction (review §candidate 2)._ Behavior change plus a new guard module per the diagnostics conventions; decide throw-vs-sentinel once, deliberately.
- **`onComplete`/`onLoop` payloads; onPlay/onStop/onSeek/label-entered signals.** _Open direction (charter #1)._ Signal-shape decision.
- **Frame-skip policy (`maxFrameSkip` / `skipPolicy`).** _Open direction (charter #3)._ The landing-frame-only contract is now documented in source; a clamp is a deliberate policy fork.
- **Clock integration.** _Cross-package; unblocked._ `@flighthq/clock` now exists, so the charter's North star 5 can proceed — but the seam shape (Clock parameter vs caller-scaled deltaTime) is an open direction (review §candidate 4).
- **Generic/feature-alias target type for `Timeline.target`/`FrameScript`.** _Cross-package (`@flighthq/types`) + design._ Review §candidate 1; route to charter Open directions.
- **Remove the orphaned `PlayMode` type from `@flighthq/types`.** _Cross-package._ Superseded by `TimelinePlayMode`, referenced nowhere outside types; deletion is a types-package edit outside this cell.
- **Charter pruning: Open directions 6 and 7 are resolved** (Package Map line updated; movieclip charter exists). _Charter edit — user's gate at the next direction session._
- **`timeline-formats` neighbor / SWF-Animate importer.** _Bedrock/plurality guard._ No second format exists yet; the native `createTimelineSource` plus movieclip's spritesheet bridge do not justify a `-formats` cell.
- **Rust `flighthq-timeline` crate.** _Global posture._ TS leads; Rust follows in parity passes.

## Approved

- [2026-07-31 · completed] `updateTimeline` boolean change signal; frameRate-null ordering contract; frame-script bulk list/clear queries; public label-list accessor
- [2026-07-02 · picked] Sweep items 1–3: disposeTimelineSignals, setMovieClipSource dead branch, frame-skip contract comment
