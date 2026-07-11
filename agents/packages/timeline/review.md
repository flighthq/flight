---
package: '@flighthq/timeline'
status: partial
score: 38
updated: 2026-06-25
ingested:
  - status.md
  - charter.md
  - source
  - changes.patch
  - '@flighthq/types (head)'
base: origin/main (eb73c3d74)
evidence: integration-b2824e3d8 delta
---

# timeline — Review (merge gate: integration b2824e3d8 → approved origin/main eb73c3d74)

Evidence: the **delta** between `incoming/integration-b2824e3d8/base/packages/timeline/` (= `origin/main` eb73c3d74, the approved floor — **not** under review) and `incoming/integration-b2824e3d8/head/packages/timeline/`, plus the `packages/timeline/` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings reference `b2824e3d8:<path>`. This is a **merge gate**, not a survey: the only question is whether the incoming change is fit to land on the blessed baseline. The score grades the candidate state, not the diff's ambition.

## Verdict

`partial — 38/100`. **REJECT as a merge candidate.** The feature design is good — armed signal lifecycle (`enableTimelineSignals` / `enableMovieClipSignals`), frame scripts (`add`/`get`/`removeTimelineFrameScript` + MovieClip mirrors), loop/once `playMode` with `onComplete`/`onLoop`, and current-label introspection are exactly the right additions, well-named and well-tested in intent. But **the delta does not compile against its own bundle.** The timeline source consumes types and `Timeline` fields (`frameScripts`, `playMode`, `signals`, `TimelineSignals`, `TimelineFrameEvent`, `FrameScript`) that **do not exist anywhere in the head `@flighthq/types` package**, and routes payload-carrying signals through `MovieClipSignals` slots that are still typed `Signal<() => void>`. The types-first layer was never updated (or was lost in the integration merge). This is a hard `tsc` break and a direct violation of the header-first contract. The design is mergeable; this _artifact_ is not — it needs its `@flighthq/types` half before it can land.

## What the delta intends (verified against source + tests)

**Armed signal lifecycle.** `b2824e3d8:packages/timeline/src/timeline.ts:51` adds `enableTimelineSignals(timeline)` (idempotent, stores on `timeline.signals`), and `fireConstructFrame` (`:178`) now emits `onExitFrame` → `onEnterFrame` → `constructFrame` → frame script → `onFrameConstructed` in order, each gated on `signals !== null` so a clip with no signals enabled pays nothing per frame. `advanceFrame` (`:131`) emits `onLoop` on wrap and `onComplete` + `isPlaying=false` on the terminal frame in `once` mode. `b2824e3d8:packages/timeline/src/movieClip.ts:60` adds `enableMovieClipSignals(clip)` which lazily creates the timeline and delegates to `enableTimelineSignals`. This is the correct `enable*`-opt-in shape the codebase map mandates for signal groups, and a real improvement over base's eager `createMovieClipSignals()` + auto-lazy `getMovieClipSignals`.

**Frame scripts.** `addTimelineFrameScript` / `getTimelineFrameScript` / `removeTimelineFrameScript` (`:12`, `:73`, `:105`) over a lazily-allocated `timeline.frameScripts: Map<number, FrameScript>`, label-or-number addressed via `resolveFrame`, cleared back to `null` when emptied. MovieClip mirrors (`addMovieClipFrameScript` etc.) delegate with a null-timeline guard. Scripts fire once on frame entry inside `fireConstructFrame` (`:191`), correctly not re-firing on a stopped repeated frame (test `:364`).

**Play mode.** `createTimeline` (`:17`) defaults `playMode: 'loop'`; `advanceFrame` branches `loop` (wrap + `onLoop`) vs `once` (clamp at `totalFrames`, stop, `onComplete`). Two-value closed set — a tight closed system, acceptable as a union (fork B exception).

**Current label.** `getTimelineCurrentLabel` (`:61`) returns the last label at or before `currentFrame`; `getMovieClipCurrentLabel` mirrors with a null guard. Clean, sentinel-on-empty (`null`).

The new test files are colocated, alphabetized, and mirror the new exports 1:1 (`addTimelineFrameScript`, `enableTimelineSignals`, `getTimelineCurrentLabel`, `getTimelineFrameScript`, `removeTimelineFrameScript`, and the MovieClip mirrors all have `describe` blocks). On the testing axis the delta is honest and thorough — about _intended_ behavior.

## Blocking defects (the merge gate)

### 1. The delta does not compile — the types-first layer was never updated (CRITICAL)

`b2824e3d8:packages/timeline/src/timeline.ts:2` imports from `@flighthq/types`:

```ts
import type {
  DisplayObject,
  FrameScript,
  Timeline,
  TimelineFrameEvent,
  TimelineLabel,
  TimelineSignals,
  TimelineSource,
} from '@flighthq/types';
```

and the body reads/writes `timeline.frameScripts`, `timeline.playMode`, `timeline.signals`. But in the **same bundle**, `head/packages/types/src/Timeline.ts` is **byte-identical to base** and declares none of those fields:

```ts
export interface Timeline {
  source: TimelineSource | null;
  target: DisplayObject | null;
  currentFrame: number;
  isPlaying: boolean;
  timeElapsed: number;
  lastFrameUpdate: number;
}
```

A tree-wide search confirms `FrameScript`, `TimelineSignals`, `TimelineFrameEvent`, and `TimelinePlayMode` are **not defined anywhere in `head/packages/`** except as _imports / uses inside `timeline.ts` itself_ — the producing definitions in `@flighthq/types` are absent, and `head/packages/types/src/index.ts` exports none of them. The `changes.patch` makes **zero** edits to any timeline/movieclip type file under `packages/types/`. Result: `tsc -b` on this bundle fails on the imports, on `timeline.frameScripts ??= new Map()`, on `timeline.playMode`, and on `timeline.signals`. This is a direct violation of the project's header-first rule ("define its types in `@flighthq/types` first, then implement against them") and an unmistakable merge blocker: the package cannot build. The base assessment.md even _describes_ a `TimelineSignals.ts` file and its header comment as already landed — so the types existed in whatever branch this feature was authored on and were **dropped on the way into this integration head**. The delta is a half-merge.

### 2. `MovieClipSignals` payload / shape mismatch (CRITICAL, same root cause)

`head/packages/types/src/MovieClipSignals.ts` still declares only three signals, all payload-free:

```ts
export interface MovieClipSignals {
  onEnterFrame: Signal<() => void>;
  onExitFrame: Signal<() => void>;
  onFrameConstructed: Signal<() => void>;
}
```

But `b2824e3d8:packages/timeline/src/movieClip.ts:60` has `enableMovieClipSignals` return `enableTimelineSignals(...)` — i.e. a `TimelineSignals` (five signals, frame-event payloads) — typed as `MovieClipSignals`, and the tests assert `signals.onComplete` / `signals.onLoop` (`b2824e3d8:packages/timeline/src/movieClip.test.ts:71`) and `signals.onEnterFrame.emit = (event) => frames.push(event.frame)` (`:94`). Against the head type, `onComplete`/`onLoop` do not exist and `onEnterFrame.emit` takes no `event`. Because `emitSignal<T>(signal, ...args: Parameters<T>)` derives its args from the signal's function type, `emitSignal(signals.onEnterFrame, frameEvent)` (`timeline.ts:189`) is also a type error against `Signal<() => void>`. The whole signal-payload model the delta relies on was supposed to land in `@flighthq/types` and did not.

## Non-blocking findings (delta-introduced, real, not merge-stoppers)

- **Signals are armed but have no teardown verb.** The delta wires `createSignal()` groups onto `timeline.signals` / `runtime.movieClipSignals` that accumulate slots, but adds no `disposeTimelineSignals` / `disposeMovieClipSignals`. Per the codebase map a signal subsystem that detaches listeners is exactly a `dispose*` case. Base had no live signals to tear down; the delta now does. Worth a follow-up, not a gate. (`b2824e3d8:packages/timeline/src/timeline.ts:168`, `movieClip.ts:60`.)
- **`setMovieClipSource` re-wire branch is a self-reassignment.** `b2824e3d8:packages/timeline/src/movieClip.ts:139` reuses the existing `clip.data.timeline`, then `if (runtime.movieClipSignals !== null) { const signals = enableTimelineSignals(timeline); runtime.movieClipSignals = signals; }`. But `enableTimelineSignals` is idempotent and the timeline object is unchanged, so this re-fetches the same already-armed group and assigns it to itself — correctness-neutral, dead-ish. Either drop it or comment _why_ it is load-bearing (it only matters if `setMovieClipSource` ever swapped the timeline object, which it does not). Already flagged in the base assessment.
- **Frame-skip accounting is undocumented.** Catch-up via `Math.floor(timeElapsed/frameTime)` (`b2824e3d8:packages/timeline/src/timeline.ts:137`) jumps to the landing frame and fires `onEnterFrame`/scripts for _that frame only_; skipped frames are silent. This matches conventional frame-advance behavior and is tested (`timeline.test.ts:455`), but carries no durable source comment. Documentation-only.

## Axis scorecard (delta vs the 7 standards)

1. **Composition / bedrock** — PASS. MovieClip stays a thin display-node wrapper that delegates to the timeline engine; frame scripts and signals are additive primitives, not config-gated branches fused into a monolith.
2. **Naming clarity** — PASS. `enableTimelineSignals`, `addTimelineFrameScript`, `getTimelineCurrentLabel`, `removeMovieClipFrameScript` — full unabbreviated type words, `get*`/`is*` correct, globally self-identifying.
3. **Tree-shaking / bundle invariant** — PASS. `package.json` is `sideEffects: false`, single `.` export; per-frame signal emission is gated on `signals !== null` so a non-signal clip pays no cost; no eager registration; no new shared-switch tax.
4. **Registry vs closed union (fork B)** — PASS. `frameScripts` is a `Map` (registry-shaped); `playMode` is a tight 2-value closed system, the sanctioned union exception.
5. **Subject triad + plurality guard** — N/A to this delta (no format/backend split introduced).
6. **Contract hygiene** — **FAIL.** Types-first violated: the delta consumes `@flighthq/types` symbols and `Timeline` fields the head types package does not declare (defects 1 & 2). Sentinels / `Readonly<>` / alias-safety are otherwise fine; `dispose*` for the new signals is missing.
7. **Tests & honesty** — PARTIAL. Tests are colocated, alphabetized, mirror exports, and assert real behavior — but they assert against a type surface that does not exist in the bundle, so they would not type-check (`tsc -b` typechecks `*.test.ts`). Honest about _intended_ behavior; the bundle is not honest about being buildable.

## Bar to merge

This is a one-cause rejection with a clean fix: land the missing `@flighthq/types` half **in the same change** — add `frameScripts` / `playMode` / `signals` to `Timeline`; add `FrameScript`, `TimelineSignals` (with `onComplete` / `onLoop` and the payload-carrying per-frame signals), `TimelineFrameEvent`, and `TimelinePlayMode`; widen `MovieClipSignals` (or re-home it onto `TimelineSignals`) so the per-frame signals carry `TimelineFrameEvent` and `onComplete` / `onLoop` exist; export all from the types barrel. With the header layer present, the source delta is a strong, mergeable feature.
