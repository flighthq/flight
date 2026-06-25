---
package: '@flighthq/timeline'
updated: 2026-06-25
basedOn: ./review.md
---

# timeline — Assessment (merge gate: integration b2824e3d8 → origin/main eb73c3d74)

Sorted from `review.md` (`partial — 38`, **REJECT**). The incoming delta is a strong feature — armed signal lifecycle, frame scripts, loop/once `playMode`, current-label introspection — but ships **without its `@flighthq/types` half**, so the package does not compile in this bundle (review defects 1 & 2). The single dominant item is therefore not a within-package sweep; it is a cross-package must-fix routed to the integration worker via `outgoing/integration/timeline.md`. `Recommended` here holds only the genuinely sweep-safe, within-`@flighthq/timeline` items that stand on their own once the types land. The charter is still a stub (North star / Boundaries / Decisions all `TODO`), so anything touching playback semantics or ownership is routed to Open directions, not `Recommended`.

## Recommended

Strictly sweep-safe: within `@flighthq/timeline` (and its own `@flighthq/types` files), no cross-package coupling beyond the already-required types fix, no open design decision.

- **Add a `dispose*` teardown for the armed signal groups.** The delta arms `createSignal()` groups onto `timeline.signals` and `runtime.movieClipSignals` that accumulate slots, with no detach path. Add `disposeTimelineSignals(timeline)` / `disposeMovieClipSignals(clip)` that clear the slot back to `null` (and null the runtime slot), matching the codebase-map `dispose*` (detach-and-release-to-GC) verb. Within-package; lands cleanly once the types exist. — review.md (Non-blocking findings, signals teardown).

- **Simplify or comment the `setMovieClipSource` signal re-wire branch.** `b2824e3d8:packages/timeline/src/movieClip.ts:139` reuses the same timeline object, so the `if (runtime.movieClipSignals !== null) { … enableTimelineSignals(timeline) … }` branch re-fetches the same idempotent group and reassigns it to itself. Either drop it (timeline is unchanged; signals stay armed) or add a durable comment pinning why it is needed. Correctness-neutral, in-source. — review.md (Non-blocking findings, self-reassignment).

- **Document the multi-frame-skip frame-accounting contract in source.** Catch-up (`Math.floor(timeElapsed/frameTime)`, `timeline.ts:137`) jumps to the landing frame and fires `onEnterFrame`/scripts for _that frame only_ — skipped frames are silent. This matches Flash and is tested (`timeline.test.ts:455`) but undocumented. Add a durable semantic comment on `advanceFrame`/`fireConstructFrame` stating the landing-frame-only contract. Documentation only. A `maxFrameSkip` clamp is a policy decision → Open directions. — review.md (Non-blocking findings, frame accounting).

## Backlog

Parked: needs a charter decision, crosses a package boundary beyond the required types fix, or is larger than a sweep. Each carries why.

- **Decide whether `onComplete`/`onLoop` carry a payload.** The new terminal signals are emitted bare (`emitSignal(signals.onComplete)`), while the per-frame signals carry `TimelineFrameEvent`. When the types are authored, this is a one-shot API-shape decision (bare vs. `{ frame }` payload) worth making deliberately rather than by accident. **Parked:** an API-shape ruling the stub charter has not made. Routed to Open directions.

- **Decide the home of `MovieClipSignals` vs `TimelineSignals`.** The delta makes `enableMovieClipSignals` return the timeline's signal group, so `MovieClipSignals` is now effectively an alias of `TimelineSignals`. The types fix can either widen `MovieClipSignals` to match or collapse the two. **Parked:** a types-layout decision (one type vs. two) that affects the public header surface. Routed to Open directions.

- **Play ranges, reverse/direction + speed, nested-clip propagation.** Carried forward from the prior assessment; none appear in this delta. Play ranges and reverse/speed need a North-star ruling on exact frame semantics; nested-clip propagation crosses into `@flighthq/node` / `@flighthq/render` with an unresolved ownership boundary. **Parked.** Routed to Open directions.

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses an item. Until then everything stays in Recommended or Backlog._

## Notes for the charter's Open directions

These surfaced during the merge review and want a charter ruling before they become work:

- **Signal payload symmetry** — should `onComplete`/`onLoop` carry a `TimelineFrameEvent` (or a `{ frame }` payload), or stay bare? Decide once, when the types are authored.
- **`MovieClipSignals` vs `TimelineSignals` identity** — one type or two? The delta has them converge; the header layout should make the call explicit.
- **Playback-semantics fork** — play ranges (label-delimited loop regions), reverse/direction, and sub-1.0 / negative playback rate all extend `advanceFrame` with frame-behavior the stub charter has not ruled on.
- **Nested-clip advance ownership** — does `timeline` walk `MovieClipKind` descendants (importing `@flighthq/node`), or does the render/update pass own recursive advance? An A-fork (source-data vs. graph participation) question.
