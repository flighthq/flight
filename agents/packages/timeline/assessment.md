---
package: '@flighthq/timeline'
updated: 2026-07-02
basedOn: ./review.md
---

# timeline — Assessment

Sorted from the depth review (38/100 — stale; types-first blocking defects have since been fixed in the live tree, effective score ~80), verified against the live tree (15 timeline exports, 21 movieClip exports, 95 tests), and the direction session (2026-07-02). Eight decisions blessed, including the timeline/movieclip split.

The package is a functional frame engine with armed signal lifecycle, frame scripts, loop/once play modes, and label navigation. The major architectural direction is the timeline/movieclip split — timeline becomes a pure frame engine, movieclip moves to its own package. The sweep-safe items below are within-`@flighthq/timeline` work that lands cleanly regardless of when the split happens.

## Recommended

Sweep-safe: within `@flighthq/timeline`, no open design decision, no cross-package coupling beyond types.

1. **Add `disposeTimelineSignals(timeline)`.** The `enableTimelineSignals` path arms `createSignal()` groups onto `timeline.signals` with no detach path. Add `disposeTimelineSignals` that clears the signal group back to `null`, matching the codebase-map `dispose*` (detach-and-release-to-GC) verb. Pure within-package addition.

2. **Simplify or document the `setMovieClipSource` signal re-wire branch.** In `movieClip.ts`, `setMovieClipSource` reuses the same timeline object, so the `if (runtime.movieClipSignals !== null) { enableTimelineSignals(timeline) }` branch re-fetches the same idempotent group and assigns it to itself. Either drop the dead branch or add a durable comment pinning why it is load-bearing. Correctness-neutral, in-source.

3. **Document the frame-skip accounting contract.** Catch-up via `Math.floor(timeElapsed/frameTime)` jumps to the landing frame and fires `onEnterFrame`/scripts for that frame only — skipped frames are silent. This matches conventional frame-advance behavior and is tested but undocumented. Add a durable semantic comment on the advance path stating the landing-frame-only contract. Documentation only — the behavior is correct.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Timeline/MovieClip split into separate packages.** _Parked — architectural._ Blessed (Decision #1). `@flighthq/movieclip` absorbs `movieClip.ts`, `createSpritesheetTimelineSource`, and `timeline-spritesheet` scope. Timeline becomes a pure frame engine with zero display-object coupling. Needs a new package scaffold, a movieclip charter, dependency rewiring, barrel/import updates, and a Package Map update. Largest remaining item.

- **`MovieClipSignals` as a separate interface.** _Parked — blocked on movieclip package._ Blessed (Decision #2). Currently `type MovieClipSignals = TimelineSignals`. When movieclip splits out, `MovieClipSignals` becomes its own interface with clip-specific signals. The exact shape is an open direction.

- **Play ranges / reverse / direction / speed.** _Parked — open direction._ Label-delimited loop regions, reverse playback, and speed control are natural timeline primitives but need design before implementation.

- **Frame-skip policy option.** _Parked — open direction._ Whether to add a `maxFrameSkip` clamp or `skipPolicy`. Frame skip has consequences for code execution (scripts on skipped frames never run). Needs a deliberate decision.

- **Clock integration.** _Parked — blocked on clock package._ Blessed (Decision #7). Timeline adopts `@flighthq/clock` once it exists.

- **Package description update.** _Parked — depends on split landing._ The Package Map line still says "MovieClip-style keyframes." Update after the split to reflect the pure-engine identity.

- **Rust `flighthq-timeline` crate.** _Parked — global posture._ TS leads, Rust follows.

## Approved

- [2026-07-02 · picked] Sweep items 1–3: disposeTimelineSignals, setMovieClipSource dead branch, frame-skip contract comment
