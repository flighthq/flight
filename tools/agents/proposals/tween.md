---
id: tween
title: '@flighthq/tween'
type: depth
target: tween
status: proposed
tier: bronze
source:
  - tools/agents/docs/reviews/maturation/depth/tween.md
  - tools/agents/docs/reviews/depth/tween.md
depends_on: []
updated: 2026-06-23
---

## Summary

solid — 64/100. A competent property tweener with a real manager, easing, repeat/reflect/reverse, smart-rotation, snapping, pause/resume at three scopes, and a color tween — but short of an authoritative GSAP/TweenJS-class library on interpolation breadth, sequencing, and time control.

## Scope (this build)

Targeting the **Bronze** tier (see `tier:` above). Advance the marker as tiers complete.

- [ ] Bronze
- [ ] Silver
- [ ] Gold

## Design

### Bronze

The 20% that delivers 80% of the value. Table-stakes interpolation and the standard lifecycle callback, plus the obvious manager queries. All small, all within this package.

- **Relative values.** Extend `NumericProps<T>` value type (or add a sibling `TweenPropertyValue = number | RelativeTweenValue` in `@flighthq/types`) to accept `"+=100"` / `"-=50"` / `"*=2"` string deltas. Resolve against the captured start in `initializeTween` (each `TweenPropertyDetail.change` is computed from the parsed delta). This is the single most-cited missing feature.
- **`createTweenFrom`** — tween _from_ an explicit start value map to the current live values. Captures `to` from the target at init, uses the supplied map as `start`.
- **`createTweenFromTo`** — both endpoints explicit; no live capture. Shares the `makeTween` core with a `captureMode: 'to' | 'from' | 'fromTo'` field on the runtime `Tween` (internal, not user-set directly).
- **`onStart` signal** on `Tween` (add to the `@flighthq/types` `Tween` interface). Fires once when `delay` elapses and the tween first becomes active (currently the first `onUpdate` is the only signal at that moment). Emit it in `updateTween` right after `initializeTween`. Standard in every reference library.
- **`repeatDelay`** in `TweenOptions`, distinct from `delay`. Fix the current `tween.elapsed = tween.delay` on repeat, which conflates initial delay with inter-cycle delay — on repeat reset to `delay - repeatDelay` semantics so the first delay and per-cycle delay are independent. Add `repeatDelay` to the `Tween` runtime fields.
- **`getTweensOf(manager, target): readonly Tween<unknown>[]`** — export the implicit `Map` lookup as a query (returns empty array, not `null`, when absent — sentinel for "none").
- **`hasTweensOf(manager, target): boolean`** and **`getActiveTweenCount(manager): number`** — cheap manager introspection used in tests and game loops.
- **`killTweensOfProperty(manager, key: string)`** — stop a single named property across every target in a manager (the "kill tweens of x" GSAP idiom). Sentinel-free (no-op when none match).

### Silver

Competitive and solid — matches a good library and covers professional use, edge cases, and the value-adapter seam that unifies color and future value types.

- **Value-interpolator seam.** Introduce `TweenInterpolatorKind` (string kind) and a `TweenInterpolator` contract in `@flighthq/types`: `{ capture(target, key): TweenSample; interpolate(sample, easedT, out): void; write(target, key, sample): void }`. Register adapters with `registerTweenInterpolator(state, FooKind, interpolator)` (no top-level registration; an `enable*`/`register*` opt-in). Reimplement **color as the first adapter** (`ColorTweenKind`) instead of the bolted-on `createColorTween` proxy — this fixes the depth review's correctness wrinkle where the color tween registers under an internal `{r,g,b}` proxy so `stopTweens(manager, userTarget)` misses it. The color adapter writes back to the real target/key, so overwrite/stop/getTweensOf all see it.
- **`createColorTween` keeps its signature** but is rebuilt on the adapter (back-compat shim) and now registers under the user target.
- **Per-property easing.** `TweenOptions.ease` accepts either one `EasingFunction` or a `Partial<Record<keyof T, EasingFunction>>`; store per-`TweenPropertyDetail.ease` and fall back to the tween ease, then manager `defaultEase`.
- **Multi-keyframe / waypoints.** `createTweenKeyframes(manager, target, duration, keyframes: readonly NumericProps<T>[], options)` — interpolate one or more properties through a sequence of values. Per-segment easing and optional per-segment duration weights.
- **Time control:**
  - **`getTweenProgress(tween): number`** / **`setTweenProgress(tween, progress)`** — normalized 0..1 read/scrub with recompute-on-set (apply values immediately, no wait for next frame).
  - **`getTweenElapsed` / `seekTween(tween, timeSeconds)`** — absolute-time scrub (delay + active span aware).
  - **`timeScale`** on both `TweenOptions`/`Tween` (per-tween) and `TweenManagerOptions`/`TweenManager` (global). `updateTweens` multiplies `deltaTime` by manager scale; `updateTween` by tween scale. Add `setTweenTimeScale` / `setTweenManagerTimeScale`.
  - **`invalidateTween(tween)`** — drop captured start values so the next update re-captures (GSAP `invalidate`).
  - **`restartTween(tween, includeDelay?)`** / **`reverseTween(tween)`** — rewind-and-replay and flip direction live.
- **Stagger helper.** `createTweenStagger(manager, targets: readonly T[], duration, propertyMap, { each, from, ease }, options)` — batch-tween N targets with incremental delay (`from: 'start' | 'center' | 'end' | number` ordering). Returns the array of created tweens.
- **`onYoyo` / `onReverse`** signal (fires when `reflect` flips direction) so callers can react to a direction change distinct from `onRepeat`.
- **Snapping config.** Replace boolean `snapping` with `snap?: boolean | Partial<Record<keyof T, number>>` — per-property snap increment (round to nearest N), not just integer.
- **Overshoot/clamp guard.** Optional `clampOvershoot` for elastic/back eases that would push a property past a hard bound.
- **Cross-package consistency.** Make the geometry interpolators (`Vector2`/`Vector3`/`Matrix`) available as registerable adapters via a thin `@flighthq/tween` ↔ `@flighthq/geometry` bridge documented as the canonical way to tween vectors, so vector tweening is first-class rather than per-property-number juggling.

### Gold

Authoritative / AAA — the canonical reference for property tweening, with composition, exhaustive edge handling, perf, docs, and 1:1 Rust parity.

- **Programmatic tween timeline** (the second-largest depth gap). Decide the boundary with `@flighthq/timeline` first (see Sequencing), then build a _programmatic_ timeline distinct from MovieClip timelines:
  - `createTweenSequence(manager, options)` / `createTweenParallel(...)` group constructors over a `TweenTimeline` entity in `@flighthq/types`.
  - **Position parameters**: `addTweenToTimeline(timeline, tween, position)` where `position` is absolute seconds, `"<"` / `">"` (start/end of previous), `"+=0.5"` / `"-=0.5"` relative offsets.
  - **Labels**: `addTimelineLabel(timeline, name, position)`, seek by label.
  - **Nested timelines** (a timeline is itself advanceable like a tween; uniform `updateTweens` walk).
  - Timeline-level `timeScale`, `repeat`, `reflect`, `getTimelineProgress`/`setTimelineProgress`, `onTimelineComplete`.
- **Custom interpolator breadth on the Silver seam**: string/unit-suffix (`"100px"`, `"50%"`), array, and path-along (`tweenAlongPath` over `@flighthq/geometry`/path) adapters — each a registered `TweenInterpolatorKind`, all tree-shakable.
- **Signals as an opt-in group.** Move `onUpdate`/`onComplete`/`onRepeat`/`onStart`/`onYoyo` behind `enableTweenSignals(tween)` per the SDK signal-group rule, so a manager that only mutates properties pays no signal cost and bundles smaller. Keep direct-callback `onComplete` fast-path for the single-listener timer case.
- **`-formats` neighbor for authoring import.** `@flighthq/tween-formats` — parse declarative tween/timeline descriptors (JSON keyframe sets, GSAP-style config objects, Tweener-string syntax) into Flight tween calls, kept out of the core bundle.
- **Performance pass.** Pooled `TweenPropertyDetail` arrays and pooled `Tween` objects (`acquireTween`/`releaseTween` brackets); avoid per-frame `splice` churn (swap-remove); avoid `Object.keys` allocation in the hot update path; benchmark 10k concurrent tweens against a committed baseline.
- **Exhaustive edge/error handling.** `duration <= 0` (instant apply), `NaN`/`Infinity` end values (throw on misuse vs. clamp), targets mutated mid-tween, completing an already-completed tween, seeking past end with repeat, `delta`-string parse failures returning a clear programmer-error throw. Sentinels for expected-missing (`getTweensOf` → `[]`), throws only for misuse.
- **Full test coverage**: per-function colocated tests including alias-safe scrubbing, per-property easing, keyframe segment boundaries, timeline position-parameter math, stagger ordering, overwrite-with-adapter, and the color-adapter stop/getTweensOf fix. Functional/example coverage demonstrating timeline + stagger in a real scene.
- **Docs**: a domain doc covering the value-adapter seam, the timeline-vs-`@flighthq/timeline` boundary, and the position-parameter grammar.
- **Rust parity.** `flighthq-tween` crate mirroring the seam: `TweenInterpolator` trait + `register_tween_interpolator`, slotmap-arena tween storage, `KindId`-keyed interpolator registry, `Signal<T>` payloads, free functions (`create_tween`, `update_tweens`, `get_tween_progress`, `set_tween_progress`, `create_tween_sequence`), out-param interpolation in the hot path. Conformance-checked against the TS package; record any intentional divergence in the conformance map.

## Sequencing & effort

Recommended order, dependencies, and items to surface before building.

1. **Bronze first, in one pass (small, self-contained).** Relative values + `from`/`fromTo` + `onStart` + `repeatDelay` are all local to `tween.ts`/`updateTweens.ts`/`internal.ts` plus a few `@flighthq/types` field additions. The manager queries (`getTweensOf`, `hasTweensOf`, `killTweensOfProperty`) are trivial Map wrappers. Add `Tween.onStart`, `Tween.repeatDelay`, and the relative-value union to `@flighthq/types` **before** implementing. Low effort, high payoff.
2. **Silver value-adapter seam is the keystone** — do it before per-property easing and keyframes, because both build on per-`TweenPropertyDetail` data, and it retires the `createColorTween` proxy correctness wrinkle. Define `TweenInterpolator` / `TweenInterpolatorKind` in `@flighthq/types` first. Medium effort; touches every code path that reads/writes target properties. After it lands, color, vector, keyframe, and unit interpolators are each small additions.
3. **Time control (Silver)** is mostly arithmetic on existing fields but `setTweenProgress`/`seekTween` must recompute and write immediately and be alias-safe; `timeScale` is one multiply in two places. Add `timeScale` to `TweenOptions`/`TweenManagerOptions` in types.
4. **Decide the timeline boundary before Gold — surface to the user.** A programmatic tween timeline overlaps conceptually with `@flighthq/timeline` (MovieClip keyframes) and `@flighthq/spritesheet`/`@flighthq/timeline-spritesheet`. The depth review flags this as possibly missing-by-design. This is a cross-package design decision: either (a) build the programmatic timeline in `@flighthq/tween` and document that `@flighthq/timeline` remains the MovieClip artifact, or (b) house programmatic sequencing in `@flighthq/timeline` and have `tween` expose only single tweens. Recommend (a) — a tween timeline is a distinct artifact (no display-object/keyframe coupling) — but raise it rather than acting autonomously.
5. **Cross-package items to surface/coordinate:**
   - Geometry interpolator bridge (Silver) couples `tween` to `@flighthq/geometry`'s `Vector*`/`Matrix` types via the adapter seam — confirm the direction of the dependency (tween should depend on geometry, not vice versa) and keep it adapter-gated so geometry is not pulled into tween-only bundles.
   - The `enableTweenSignals` group (Gold) changes the public signal surface — coordinate with the SDK barrel and any examples that read `tween.onComplete` directly.
   - `@flighthq/tween-formats` (Gold) is a new package — copy a nearby package's shape and run `npm run packages:check`.
6. **Rust parity (Gold) trails the TS seam design** — only mirror once the interpolator seam and timeline shape are settled, so the crate ports a stable API. The value-typed interpolation core is a good early conformance target (deterministic, no GPU); the stateful manager/timeline graph is all-or-nothing.

After every export change run `npm run order`, `npm run exports:check`, `npm run api`, and `npm run size`; run `npm run fix` before finishing.

## Acceptance

- [ ] Shared types defined in `@flighthq/types` first
- [ ] `npm run check` passes
- [ ] `npm run packages:check` passes
- [ ] Colocated test per export (`npm run exports:check`)
- [ ] `npm run order` / `npm run api` clean
- [ ] (Rust-relevant) `npm run rust:conformance` / `npm run mixing:conformance` considered

## Open questions

- _(none captured yet)_

## Agent brief

> Build `@flighthq/tween` up to the **Bronze** tier per the Scope + Design above (the package exists — extend it). Define any new shared types in `@flighthq/types` first. Follow the CLAUDE.md conventions. Satisfy every Acceptance checkbox. Surface cross-package or design decisions rather than guessing.

## Decision log

- 2026-06-23 — seeded from maturation analysis (status: proposed).
