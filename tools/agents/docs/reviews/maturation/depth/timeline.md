# Maturation Roadmap: @flighthq/timeline

**Current verdict:** partial — 48/100. A clean, correctly-factored playback spine (`TimelineSource` seam / `Timeline` playhead / `MovieClip` node), but two defining MovieClip features are absent — frame scripts and a working per-frame event lifecycle (the signals exist as dead fields nothing emits) — plus no loop/play-mode control.

The package's design split (`TimelineSource` = what a frame _is_, `Timeline` = playback state, `MovieClip` = the display node) is its strongest asset and the tiers below preserve it: every addition is a free function over plain data, types land in `@flighthq/types` first, allocation stays explicit, and emission stays opt-in via an `enable*` group.

## Bronze

The minimum to make the package honest and genuinely useful: arm the event surface it already advertises, deliver frame scripts (the single feature most associated with "MovieClip"), and add loop control so playback can actually stop.

- **Arm the per-frame event lifecycle.** Add `enableTimelineSignals(timeline)` and `enableMovieClipSignals(clip)` (own this package, codebase convention) that allocate _and_ arm emission. Emit `onExitFrame` (before frame change), `onEnterFrame` (after frame change, before construct), and `onFrameConstructed` (after `constructFrame`) from `updateTimeline`/`updateMovieClip` and from `seekTimeline`. Without this the existing `MovieClipSignals` is a non-functional surface — fix or delete, do not leave dead.
  - Types: add a `TimelineSignals` interface to `@flighthq/types` (so a bare `Timeline` has the lifecycle, not only `MovieClip`); have `MovieClipSignals` reuse/extend it. Add a nullable `timelineSignals` slot to the `Timeline` runtime tier (or hang it on the existing `Timeline` per the entity/runtime convention).
  - Change the signal payloads from `Signal<() => void>` to a typed `Signal<TimelineFrameEvent>` carrying `{ frame: number; previousFrame: number }` so listeners know which frame fired.
- **Frame scripts.** `addTimelineFrameScript(timeline, frame, fn)` / `removeTimelineFrameScript(timeline, frame)` / `getTimelineFrameScript(timeline, frame): FrameScript | null`, plus `addMovieClipFrameScript`/`removeMovieClipFrameScript` clip mirrors. Scripts fire exactly once on frame _entry_, after `constructFrame`. Define `type FrameScript = (target: DisplayObject, frame: number) => void` in `@flighthq/types`. This unlocks the canonical `stop()`-on-frame pattern and frame-driven jumps.
- **Loop / play-mode control.** Add `loop: boolean` (default `true`) to `TimelineSource`, or a `PlayMode` string-kind (`'loop' | 'once'`) in `@flighthq/types`. Stop automatically at `totalFrames` when not looping. Emit a completion signal `onComplete` and a wrap signal `onLoop` (mirror `@flighthq/spritesheet`'s player exactly, which already does this) on the timeline signal group.
- **Current-label introspection.** `getTimelineCurrentLabel(timeline): TimelineLabel | null` (label at/under the playhead) and `getMovieClipCurrentLabel(clip)`. Cheap, expected, mirrors AS3 `MovieClip.currentLabel`.

## Silver

Competitive with a well-regarded MovieClip/timeline library: play ranges, direction/speed, nested-clip propagation, and the importer-neighbor seam so real authored content can drive a timeline.

- **Play ranges.** `playTimelineRange(timeline, from, to, loop?)` and `gotoAndPlayTimeline` overloads taking a label that delimits a region. Add an optional `playRange: { from: number; to: number } | null` to `Timeline`. Support label-delimited loop regions (`loop between label A and label B`).
- **Playback direction and speed.** Add `direction: 1 | -1` and `playbackRate: number` (time-scale multiplier, default `1`) to `Timeline`; `setTimelinePlaybackRate`, `setTimelineDirection`, `reverseTimeline`. Continuous reverse playback (not just `prevFrame` while stopped), and clip mirrors. `advanceFrame` already centralizes stepping — extend it to honor direction/rate.
- **Nested-clip propagation — decide and implement.** A real MovieClip tree advances child MovieClips when the parent advances. Add `advanceMovieClipTree(clip, deltaTime)` that recursively updates `MovieClipKind` descendants via the hierarchy in `@flighthq/node`, or explicitly document that the render/update pass owns this and provide the hook there. The depth review flags this ambiguity (missing-by-design vs by-omission) — resolve it.
- **Scenes.** `TimelineScene` type (`{ name; from; to; labels }`) on `TimelineSource`; `gotoAndPlayTimelineScene(timeline, frame, sceneName)`, `getTimelineCurrentScene`, `getTimelineScenes`. AS3 parity for multi-scene documents.
- **`@flighthq/timeline-formats` neighbor package.** Per the `-formats` convention, importers/parsers for authored timelines live in a sibling, not the engine: a keyframe-document JSON loader (`createTimelineSourceFromDocument`) and the seam a future SWF/Adobe Animate (`.json`/DOMDocument) importer plugs into. Keeps the engine dependency-light and tree-shakable.
- **Frame-script bulk authoring + enumeration.** `getTimelineFrameScripts(timeline): ReadonlyMap<number, FrameScript>`, `clearTimelineFrameScripts`. Label-keyed script attachment (`addTimelineFrameScript(timeline, 'intro', fn)`).
- **Goto-by-time / scrubbing.** `getTimelineDuration(timeline): number` (ms), `seekTimelineToTime(timeline, ms)` for editor scrubbing and time-synced playback; reuse the existing seek-safe `constructFrame` invariant.

## Gold

Authoritative MovieClip timeline: exhaustive lifecycle, deterministic frame accounting, full test/parity coverage, and a 1:1 `flighthq-timeline` Rust crate.

- **Complete signal lifecycle.** `onPlay`, `onStop`, `onSeek`, `onScriptError` (sentinel-return, not throw, when a frame script faults), plus `onFrameLabel` fired when the playhead enters a labeled frame. All opt-in via the `enable*` group, all typed payloads, all tree-shaking to zero when unused.
- **Deterministic frame accounting.** Audit and document the dropped-frame / catch-up behavior in `advanceFrame` (currently `Math.floor(timeElapsed/frameTime)` jumps multiple frames in one update). Decide whether skipped frames still fire their `onEnterFrame`/frame-scripts (Flash fires the landing frame only; spell it out) and add a `maxFrameSkip` clamp. Add fractional-frame interpolation hook for tween-on-timeline consumers.
- **Bidirectional + ping-pong + arbitrary speed.** `PlayMode` extended to `'ping-pong'`; negative `playbackRate`; sub-1.0 rates that hold a frame across multiple updates. Full alias-safe, out-param-clean stepping math.
- **Synchronized child timelines.** Frame-accurate parent→child advance so a nested MovieClip lands on the same logical frame regardless of host-loop cadence; documented ownership of the recursive pass and a `synchronizeMovieClipTree` for deterministic capture.
- **Exhaustive tests + functional/parity coverage.** Colocated unit tests for every new export (`exports:check` green); a functional test scene (`tests/functional/timeline-playback`) exercising play/stop/loop/reverse/frame-script-stop across Canvas/DOM/WebGL via the `functional-test` skill; aliased `out`/seek-safety tests; frame-script-fault sentinel tests.
- **`flighthq-timeline` Rust crate (1:1 conformance).** Mirror the full surface: `Timeline`/`TimelineSource`/`MovieClip` as value types + slotmap node, `KindId` for `MovieClipKind`, `Signal<TimelineFrameEvent>` over the `flighthq-signals` `Arc<dyn Fn>` form, frame scripts as `Box<dyn Fn(&mut DisplayObject, u32)>`, free functions `update_timeline`/`add_timeline_frame_script`/`goto_and_play_timeline`. Paired functional scene `timeline_playback` for the parity differ; record any intentional TS↔Rust divergence in the conformance map.
- **Docs.** Authoring guide covering the construct-vs-script split, the seek-safe/idempotent `constructFrame` contract, loop/range/scene semantics, and the nested-clip advancement contract.

## Sequencing & effort

Recommended order (each tier builds on the prior; within Bronze the items are near-independent but share a types pass):

1. **Bronze, types-first pass (small, do once).** In `@flighthq/types`: add `TimelineSignals`, `TimelineFrameEvent`, `FrameScript`, `PlayMode`, `loop` on `TimelineSource`, and frame-script/playRange fields on `Timeline`. The header layer is the design surface — land it before any implementation. ~0.5 day.
2. **Bronze event lifecycle (medium).** Wire emission into `updateTimeline`/`seekTimeline` and add `enableTimelineSignals`/`enableMovieClipSignals`. This is the highest-value fix (turns a dead, misleading surface into a real one) and is the natural slot the depth review identifies in `updateTimeline`'s advance/construct split. ~1 day incl. tests.
3. **Bronze frame scripts + loop/complete (medium).** Frame scripts depend on the lifecycle ordering (fire after construct on entry); loop/complete reuses the spritesheet player's proven pattern. ~1–1.5 days.
4. **Bronze current-label (small).** ~0.25 day.
5. **Silver** in order: play ranges → direction/speed → scenes → nested-clip decision → `-formats` neighbor. The nested-clip item is a **cross-package design decision** (does the render/update pass own recursive advance, or does this package?) — surface it to the user before implementing; it touches `@flighthq/render` and `@flighthq/node`. ~1 week.
6. **Gold** is the long tail: deterministic accounting audit, full functional/parity scene, and the Rust crate. The Rust crate should not start until the TS surface is Silver-stable, since it conforms to TS.

**Cross-package / design-decision items to surface:**

- **Nested MovieClip advancement** (Silver): ownership boundary between `@flighthq/timeline` and the render/update pass. Decide explicitly; the depth review flags the current silence as ambiguous.
- **`@flighthq/timeline-formats` neighbor package** (Silver): confirm the `-formats` split before building the importer seam; mirrors `@flighthq/spritesheet-formats`.
- **`TimelineSignals` vs `MovieClipSignals` relationship** (Bronze): a bare `Timeline` (no display node) should still expose the lifecycle, so the base signal interface belongs on the timeline, with `MovieClipSignals` reusing it. Confirm this is the intended layering rather than duplicating signals at the clip tier.
- **Signal payload change** (Bronze): widening `Signal<() => void>` to `Signal<TimelineFrameEvent>` is a public-API reshape — acceptable pre-release, but run `npm run api` and update any consumer (likely none yet).
- **Coordinate with `@flighthq/spritesheet`/`@flighthq/timeline-spritesheet`** so the loop/complete signal names and semantics stay identical across both animation engines (`onComplete`/`onLoop` already established there).
