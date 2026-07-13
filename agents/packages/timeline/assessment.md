---
package: '@flighthq/timeline'
updated: 2026-07-13
basedOn: ./review.md
---

# timeline — Assessment

Sorted from the 2026-07-13 review (solid — 68/100). The 2026-06-25 merge-gate blockers are resolved (types-first fixed), the movieclip extraction landed (`75c4076b`), and all three previously Approved sweep items are verified done in source. What remains is playback depth (parked on open directions) plus a short sweep-safe list.

## Recommended

Sweep-safe: within `@flighthq/timeline`, no cross-package coupling, no open design decision.

1. **Make `updateTimeline` return whether the frame changed.** North star 4 states this outright ("Update returns whether the frame changed"); the function returns `void` today. Return `boolean` from `updateTimeline` (frame realized this update), add the aliased/no-change test cases. Charter-decided, within-package, greenfield signature change with no external consumers beyond movieclip's thin delegate.
2. **Document the frameRate-null advance ordering.** Between updates in the one-frame-per-update path, `currentFrame` reads one ahead of the realized frame (`lastFrameUpdate`). Add a durable semantic comment on `updateTimeline` stating the two clock paths' ordering and what `currentFrame` means in each. Documentation-only floor; changing the semantics itself is an open direction (review §candidate 3).
3. **Frame-script bulk queries.** `getTimelineFrameScriptFrames` (or an iteration seam) and `clearTimelineFrameScripts` — completes the CRUD family over the existing `Map`, null-sentinel on empty. Small, additive, no design fork.
4. **`getTimelineLabels(timeline)` public accessor.** The private helper already exists; labels are reachable only via `timeline.source?.labels` or one-at-a-time lookups. Exposing the read-only list (empty-array sentinel) serves editors/debug UIs without touching the source contract.

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

- [2026-07-02 · picked] Sweep items 1–3: disposeTimelineSignals, setMovieClipSource dead branch, frame-skip contract comment
