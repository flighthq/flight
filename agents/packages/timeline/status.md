---
package: '@flighthq/timeline'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# timeline — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Executed the sweep-safe items from `assessment.md` `## Recommended` that fall strictly within `@flighthq/timeline`.

**Done:**

- **Simplified the `setMovieClipSource` signal re-wire branch** (`movieClip.ts`). The `if (runtime.movieClipSignals !== null) { … enableTimelineSignals(timeline); runtime.movieClipSignals = signals; }` branch was correctness-neutral dead code: `setMovieClipSource` reuses the clip's existing `clip.data.timeline`, and `enableTimelineSignals` is `??=`-idempotent, so it re-fetched the same already-armed group and reassigned it to itself. Dropped the branch and replaced it with a durable semantic comment pinning _why_ no re-wire is needed (the runtime slot and `timeline.signals` are the same group). No behavior change — all 95 tests still pass. `EntityRuntimeKey` and `enableTimelineSignals` imports remain in use elsewhere in the file.
- **Documented the multi-frame-skip frame-accounting behavior in source** (`timeline.ts`). Added durable semantic comments on `advanceFrame` (the `floor(timeElapsed / frameTime)` landing-frame jump) and `fireConstructFrame` (constructs/fires the landing frame only; skipped frames' enter/exit signals and scripts do not run; `previousFrame` may be many frames back). States the landing-frame-only contract already covered by `timeline.test.ts`. Documentation only, no behavior change. Noted explicitly that a `maxFrameSkip` clamp and fractional-frame hook are out of scope (policy decision → Open directions).

**Parked:**

- **Fix the over-claiming `TimelineSignals.ts` header comment.** cross-boundary: the file is `packages/types/src/TimelineSignals.ts`, owned by `@flighthq/types`, outside the `@flighthq/timeline` edit boundary for this sweep. The reword ("the three per-frame signals carry a `TimelineFrameEvent`; `onComplete`/`onLoop` are bare") is correct and ready, but must be applied by a session permitted to edit `packages/types/`.

**Tests:** `npm run test --workspace=packages/timeline` → 2 files, 95 tests, all pass.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/timeline

**Session date:** 2026-06-24 **Previous score:** 48/100 **Estimated new score:** 72/100

## Implemented APIs

### New types in @flighthq/types (one concept per file)

- `packages/types/src/FrameScript.ts` — `type FrameScript = (target: DisplayObject, frame: number) => void`
- `packages/types/src/PlayMode.ts` — `type PlayMode = 'loop' | 'once'`
- `packages/types/src/TimelineFrameEvent.ts` — `interface TimelineFrameEvent { frame: number; previousFrame: number }`
- `packages/types/src/TimelineSignals.ts` — `interface TimelineSignals` with `onComplete`, `onEnterFrame`, `onExitFrame`, `onFrameConstructed`, `onLoop`
- Updated `packages/types/src/Timeline.ts` — added `frameScripts: Map<number, FrameScript> | null`, `playMode: PlayMode`, `signals: TimelineSignals | null`
- Updated `packages/types/src/MovieClipSignals.ts` — now a type alias for `TimelineSignals` (removes duplication, ensures MovieClip and bare Timeline share the same signal shape)

### New functions in @flighthq/timeline

**timeline.ts:**

- `addTimelineFrameScript(timeline, frame, script)` — attaches a FrameScript to a 1-based frame; frame can be a label string
- `enableTimelineSignals(timeline)` — allocates a `TimelineSignals` group and arms emission; idempotent
- `getTimelineCurrentLabel(timeline)` — returns the label at/under the playhead (last label with `frame <= currentFrame`), or null
- `getTimelineFrameScript(timeline, frame)` — returns the script at a frame, or null
- `removeTimelineFrameScript(timeline, frame)` — removes a script; clears `frameScripts` to null when the last one is removed

**movieClip.ts:**

- `addMovieClipFrameScript(clip, frame, script)` — delegates to `addTimelineFrameScript`
- `enableMovieClipSignals(clip)` — allocates signals on the runtime and arms timeline emission; creates a timeline if none exists
- `getMovieClipCurrentLabel(clip)` — delegates to `getTimelineCurrentLabel`
- `getMovieClipFrameScript(clip, frame)` — delegates to `getTimelineFrameScript`
- `removeMovieClipFrameScript(clip, frame)` — delegates to `removeTimelineFrameScript`

### Changed behavior

- `getMovieClipSignals` previously lazily allocated signals; it now returns `null` until `enableMovieClipSignals` is called. This makes the opt-in pattern explicit and matches the codebase convention.
- `createMovieClipSignals` removed — no longer needed; signals are created inside `enableMovieClipSignals`/`enableTimelineSignals`.
- `updateTimeline` now emits `onExitFrame` (before frame change), `onEnterFrame` (after), and `onFrameConstructed` (after constructFrame) when `timeline.signals !== null`.
- `updateTimeline` now respects `playMode`: in `'once'` mode, stops at `totalFrames`, emits `onComplete`; in `'loop'` mode emits `onLoop` on wrap.
- Frame scripts fire after `constructFrame` on frame entry, before `onFrameConstructed` signal.
- `createTimeline` defaults: `playMode: 'loop'`, `frameScripts: null`, `signals: null`.

### Tests

All 95 tests pass (2 test files). New test coverage for:

- `addTimelineFrameScript` (3 cases), `enableTimelineSignals` (7 cases), `getTimelineCurrentLabel` (4 cases), `getTimelineFrameScript` (3 cases), `removeTimelineFrameScript` (3 cases)
- `addMovieClipFrameScript`, `enableMovieClipSignals`, `getMovieClipCurrentLabel`, `getMovieClipFrameScript`, `removeMovieClipFrameScript` (full describe blocks each)
- Signal emission order test (exit → enter → constructed)
- `onLoop` and `onComplete` emission tests
- `playMode: 'once'` stop-at-end tests

## Deferred items and why

### Silver

- **Play ranges** (`playTimelineRange(timeline, from, to, loop?)`): straightforward to add but no immediate consumer; deferred to Silver.
- **Playback direction and speed** (`direction: 1 | -1`, `playbackRate: number`, `reverseTimeline`, `setTimelinePlaybackRate`): requires updating `advanceFrame` and `Timeline` type; deferred to Silver.
- **Nested-clip propagation** — `advanceMovieClipTree(clip, deltaTime)`: cross-package design decision. The depth review flags this as ambiguous (missing-by-design vs by-omission). Resolution requires deciding whether `@flighthq/timeline` imports from `@flighthq/node` to walk the hierarchy, or whether the render/update pass owns it. **Surfaced to user rather than decided autonomously.** Touches `@flighthq/render` and `@flighthq/node`.
- **Scenes** (`TimelineScene`, `gotoAndPlayTimelineScene`, `getTimelineCurrentScene`, `getTimelineScenes`): AS3 multi-scene parity; deferred to Silver.
- **`@flighthq/timeline-formats` neighbor package**: keyframe-document JSON loader and SWF/Animate importer seam. Confirm the `-formats` split before building; mirrors `@flighthq/spritesheet-formats`. Deferred to Silver.
- **Frame-script bulk authoring** (`getTimelineFrameScripts`, `clearTimelineFrameScripts`, label-keyed attach): small addition; deferred with Silver-tier items.
- **`seekTimelineToTime(timeline, ms)`** / `getTimelineDuration(timeline)`: editor scrubbing; deferred to Silver.

### Gold

- **Complete signal lifecycle** (`onPlay`, `onStop`, `onSeek`, `onScriptError`): deferred to Gold per roadmap.
- **`onFrameLabel`** fired when the playhead enters a labeled frame: deferred to Gold.
- **Deterministic frame accounting audit**: `Math.floor(timeElapsed/frameTime)` multi-frame skips — decide whether skipped frames fire their scripts/signals; add `maxFrameSkip` clamp. Deferred to Gold.
- **Ping-pong play mode**, negative `playbackRate`, sub-1.0 rates: deferred to Gold.
- **`flighthq-timeline` Rust crate**: should not start until TS surface is Silver-stable. Deferred to Gold.
- **Functional test scene** (`tests/functional/timeline-playback`): requires `functional-test` skill; deferred to Gold.

## Concerns and surprises

- **`onComplete` in `advanceFrame` (frameRate-null path)**: when `playMode === 'once'` and the frame-rate-null path would advance past `totalFrames`, we stop and emit `onComplete` before `fireConstructFrame` is called for the final frame. This means `totalFrames` is never reached as a new frame in that path — the last constructed frame is `totalFrames - 1`, then the stop happens. This matches `advanceFrame`'s contract (return the new frame, and caller calls `fireConstructFrame`), but is subtle: in the `frameRate !== null` path we set the frame to `totalFrames` before returning, so the `frameRate: null` path should match. Verified by tests.

  Actually: in `frameRate: null` path when `next > totalFrames`, if `playMode === 'once'`: we stop, emit `onComplete`, and return `totalFrames`. This is correct — `totalFrames` is returned, then `fireConstructFrame` is called with `totalFrames`. The behavior is consistent.

- **Signal payload type change**: `MovieClipSignals` previously used `Signal<() => void>` for all lifecycle signals; it now uses typed payloads (`Signal<(event: TimelineFrameEvent) => void>`). This is a public API reshape but acceptable pre-release. Any existing listener that was `() => void` now needs `(event: TimelineFrameEvent) => void`. There are no known consumers outside this package.

- **`enableMovieClipSignals` creates a bare `Timeline` when none exists**: if the user calls `enableMovieClipSignals` before `setMovieClipSource`, a timeline is created with `source: null`. The signals are then armed on that timeline. When `setMovieClipSource` is later called, we detect `runtime.movieClipSignals !== null` and re-wire by calling `enableTimelineSignals` on the new timeline (which returns a fresh signals group) and updating `runtime.movieClipSignals`. The old timeline's signal group is orphaned but harmless.

  This is slightly awkward. A cleaner model might be to arm signals lazily at update time rather than up front. But the current behavior is correct and predictable for typical use patterns.

## Suggestions for future sessions

1. **Silver play ranges** are the next highest-value item: `playTimelineRange(timeline, from, to, loop?)` enables sub-animation segments (walk cycle within a full character animation timeline) and is the natural step after loop/once.
2. **Nested-clip propagation decision**: get user input on whether `@flighthq/timeline` should import `@flighthq/node` to walk the hierarchy. If yes, `advanceMovieClipTree(clip, deltaTime)` is a Silver-tier addition. If no, document the contract in the render/update pass.
3. **`@flighthq/timeline-formats` neighbor package**: once the engine is Silver-stable, the formats seam unlocks keyframe-document authoring and future SWF/Animate import.
4. **Playback rate / direction** (Silver): `setTimelinePlaybackRate`, `setTimelineDirection`, `reverseTimeline` — high user value, requires updating `advanceFrame` with a `direction * playbackRate` multiplier.
5. **Gold functional test**: once the surface is stable, a `tests/functional/timeline-playback` scene that exercises play/stop/loop/reverse/frame-script-stop visually via Canvas/DOM/WebGL would be a strong regression gate.
