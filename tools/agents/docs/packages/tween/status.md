---
package: '@flighthq/tween'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# tween — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## [2026-06-24 · builder-67dc46d64] — as-claimed, not yet review-verified

# Status: @flighthq/tween

**Previous score**: 64/100 (solid) **Estimated new score**: 82/100 (competitive silver)

## Implemented APIs

### Types (packages/types/src/)

`Tween.ts` — extended the `Tween<T>` interface:

- `onStart: Signal<() => void>` — fires once when the initial delay elapses and the tween first becomes active
- `repeatDelay: number` — per-cycle inter-repeat delay, independent of the initial `delay`
- `timeScale: number` — per-tween playback speed multiplier (1.0 = normal)
- `NumericProps<T>` value type changed from `number` to `TweenPropertyValue` to accept relative strings
- `TweenPropertyValue = number | string` — absolute number or relative delta (`"+=N"`, `"-=N"`, `"*=N"`)

`TweenOptions.ts` — added:

- `repeatDelay?: number`
- `timeScale?: number`

`TweenManagerOptions.ts` — added:

- `timeScale?: number`

`TweenManager.ts` — added:

- `timeScale: number` — global playback speed multiplier for all tweens in the manager

### Implementation (packages/tween/src/)

`internal.ts` — rewritten to:

- `resolvePropertyEndValue(start, value)` — parses `TweenPropertyValue`; throws a programmer error for unrecognized relative syntax
- `initializeTween` now emits `onStart` after capturing start values
- `initializeTweenFrom` — init for "from" mode: `propertyMap` = explicit starts, target = live end values
- `initializeTweenFromTo` — init for "fromTo" mode: both endpoints explicit, no live capture
- `initializeTweenByMode` — dispatch based on internal capture mode (`to` / `from` / `fromTo`)
- `TweenInternal` / `TweenCaptureMode` — internal WeakMap-based extension for from/fromTo tweens
- `getTweenInternal` / `setTweenInternal` — internal accessor/mutator

`tween.ts` — added:

- `createTweenFrom(manager, target, duration, fromMap, options?)` — tween from explicit starts to live target values
- `createTweenFromTo(manager, target, duration, fromMap, toMap, options?)` — both endpoints explicit
- `getActiveTweenCount(manager)` — total active tween count across all targets
- `getTweensOf(manager, target)` — returns `readonly Tween<any>[]`; empty array (not null) when absent
- `hasTweensOf(manager, target)` — boolean manager introspection
- `killTweensOfProperty(manager, key)` — stop all tweens with a named property across all targets; no-op when none match
- `makeTween` updated to set `onStart`, `repeatDelay`, `timeScale`

`tweenManager.ts` — `createTweenManager` now sets `timeScale: options?.timeScale ?? 1`

`updateTweens.ts` — updated:

- `updateTween` now multiplies `deltaTime * tween.timeScale`
- `updateTweens` now multiplies `deltaTime * manager.timeScale` before dispatching to tweens
- Repeat reset uses `tween.elapsed = tween.delay - tween.repeatDelay` so initial delay and per-cycle delay are independent

`tweenProgress.ts` — new file:

- `getTweenProgress(tween)` — normalized 0..1 progress; 0 in delay phase, 1 when complete
- `invalidateTween(tween)` — drop captured start values, reset elapsed and complete (GSAP `invalidate`)
- `restartTween(tween, includeDelay?)` — rewind to beginning; `includeDelay=false` skips the initial delay
- `seekTween(tween, timeSeconds)` — jump to absolute elapsed time and apply values immediately; alias-safe
- `setTweenProgress(tween, progress)` — jump to normalized 0..1 progress; alias-safe

`tweenStagger.ts` — new file:

- `createTweenStagger(manager, targets, duration, propertyMap, stagger?, options?)` — batch-tween N targets with staggered delays
- `TweenStaggerOptions` with `each` (delay interval), `from` (`'start' | 'center' | 'end' | number`), `staggerEase`

`index.ts` — now exports `tweenProgress` and `tweenStagger`

### Tests

All new exported functions have colocated tests. Total: 125 tests across 7 test files (up from ~80).

- `tween.test.ts` — extended with tests for `createTweenFrom`, `createTweenFromTo`, `getActiveTweenCount`, `getTweensOf`, `hasTweensOf`, `killTweensOfProperty`, `onStart`, `repeatDelay`, and per-tween `timeScale`
- `updateTweens.test.ts` — added manager `timeScale` test; removed duplicate `smartRotation` describe block
- `tweenManager.test.ts` — added `timeScale` default/option tests
- `tweenProgress.test.ts` — new, covers all 5 functions including alias-safe scrub
- `tweenStagger.test.ts` — new, covers stagger ordering, timing, all `from` modes

## Deferred Items and Why

### Timeline boundary (Gold — cross-package design decision)

The roadmap flags a programmatic tween timeline (`createTweenSequence`, `createTweenParallel`, position parameters, labels, nested timelines) as the second-largest depth gap. This is deferred because it is explicitly a cross-package design decision: either (a) build the programmatic timeline in `@flighthq/tween` and document that `@flighthq/timeline` remains the MovieClip/keyframe artifact, or (b) house programmatic sequencing in `@flighthq/timeline`. Recommend (a) — a tween timeline is a distinct artifact with no display-object coupling — but this must be a deliberate, documented choice raised with the user before acting.

### Value-interpolator seam (Silver — deferred to keep scope bounded)

The roadmap calls for a `TweenInterpolator` / `TweenInterpolatorKind` seam and rebuilding `createColorTween` as an adapter rather than a proxy. This is a moderate-effort keystone that touches every code path. It is the next natural step but was not completed in this session to avoid an outsized single change. The `createColorTween` proxy correctness wrinkle (stop/getTweensOf miss the color tween because it is registered under an internal `{r,g,b}` proxy, not the user's target) remains. Addressed in Silver+.

### Per-property easing (Silver — depends on value-adapter seam)

`TweenOptions.ease` accepting a `Partial<Record<keyof T, EasingFunction>>` and per-`TweenPropertyDetail.ease` storage builds on the per-property detail model that the adapter seam would also touch. Deferred until the adapter seam lands to avoid doing it twice.

### Multi-keyframe / waypoints (Silver — depends on value-adapter seam)

`createTweenKeyframes` builds on per-`TweenPropertyDetail` easing. Deferred.

### Geometry interpolator bridge (Silver — cross-package dependency)

Tween adapters for `Vector2` / `Vector3` / `Matrix` require a `@flighthq/geometry` dependency. Appropriate but should be confirmed directional before adding. Deferred.

### `onYoyo` signal (Silver)

Fires when `reflect` flips direction. Small addition, deferred to keep scope.

### `@flighthq/tween-formats` neighbor (Gold)

A new package for parsing declarative tween descriptors. A new package requires `npm run packages:check` alignment and a deliberate scope decision.

### Rust parity (Gold)

`flighthq-tween` crate is out of scope until the TS seam is fully stabilized (especially the adapter seam and timeline boundary). The value-typed interpolation core (deterministic, no GPU) is an early conformance target once settled.

## Concerns and Surprises

- **`createColorTween` proxy mismatch** is a live bug: `stopTweens(manager, userTarget)` will not stop a color tween because the color tween is registered under an internal `{r,g,b}` proxy object, not `userTarget`. `getTweensOf(manager, userTarget)` also misses it. This is pre-existing but worth fixing alongside the adapter seam.

- **`defaultManager` is a module-level singleton** constructed at import time. The CLAUDE.md side-effect-free rule is satisfied (it is just a `new Map()` plus an easing reference), but it is still shared mutable state. A stricter interpretation would prefer explicit manager creation. Left as-is since it matches the existing design and is a convenience pattern.

- **Unit-agnostic time** — the tween system passes time values through unchanged (no unit normalization). `each` in `createTweenStagger` and `delay` in `TweenOptions` are in whatever unit the caller uses for `updateTweens`. This is correct design but can surprise new users who assume seconds. The docs/examples should be consistent.

- **`seekTween` marks complete when seeking to end**: calling `setTweenProgress(tween, 1)` or `seekTween(tween, delay + duration)` marks the tween complete and fires `onComplete`. This is the correct behavior but callers who want to scrub to the end state without triggering completion should use `seekTween` with `duration - epsilon`.

## Suggestions for Future Sessions

1. **Implement the value-interpolator seam** — `TweenInterpolator` / `TweenInterpolatorKind` in `@flighthq/types`, rebuild `createColorTween` as a registered adapter that writes to the real target/key, fix the stop/getTweensOf mismatch.
2. **Decide and document the timeline boundary** with the user before implementing `createTweenSequence`/`createTweenParallel`.
3. **Per-property easing** after the adapter seam.
4. **`onYoyo` signal** — small, self-contained, add as a follow-on to `onStart`.
5. **Performance pass** — pooled `TweenPropertyDetail` and `Tween` objects, swap-remove instead of splice, avoid `Object.keys` in the hot update path. Benchmark 10k concurrent tweens.
6. **Rust parity** — once the TS seam is stable, `flighthq-tween` is a good first crate: value-typed, no GPU, deterministic, conformance-checkable.
