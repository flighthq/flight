---
package: '@flighthq/tween'
updated: 2026-07-31
basedOn: ./review.md
---

# tween — Assessment

Sorted from the depth review (76/100, solid), the landed coverage expansion, and the direction session
(2026-07-02). Six decisions blessed. The package is a professional-grade property tweener with broad
coverage. The two largest remaining gaps — the value-interpolator seam and the programmatic timeline —
are both design decisions now blessed in the charter, ready for implementation. All four sweep items
have landed.

## Recommended

_None open._ All four sweep items landed and were re-verified against live source on 2026-07-31 (10
source files, 7 test files, 118 tests, 26 exports); they are recorded under [Landed](#landed) below,
outside this section so the TODO generator stops reporting them as work.

## Landed

1. ~~**Add the `onYoyo` (direction-flip) signal.**~~ Landed. `Tween.onYoyo` is created in `tween.ts`, emitted
   at the flip in `updateTweens.ts`, and covered by "emits onYoyo on direction flip with reflect".
2. ~~**Document the unit-agnostic time contract in source.**~~ Landed. `updateTweens.ts` carries the durable
   comment: time is unit-agnostic, and `deltaTime`, `duration`, `delay`, `repeatDelay` and `each` all pass
   through in whatever unit the caller supplies, with no built-in seconds assumption.
3. ~~**Fix the `Tween.onComplete` doc comment.**~~ Landed. It now reads "Fires once when the tween finishes
   its final cycle (after all repeats)" rather than the copied `onStart` text.
4. ~~**Pin the `seekTween`-to-end completion behavior with a test + comment.**~~ Landed. `tweenProgress.ts`
   states the exact-end contract, and its colocated test covers both halves: seeking to `delay + duration`
   completes and emits `onComplete`, while seeking just before the end does neither. `setTweenProgress(1)`
   is pinned separately to the same completion behavior.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **Value-interpolator seam.** _Parked — keystone design work._ Blessed (Decision #1): `TweenInterpolatorKind` + `TweenInterpolator` open registry, color as first adapter, performance-first numeric path. The single highest-leverage remaining piece — unblocks per-property easing, keyframes, geometry bridge, and fixes the `createColorTween` proxy bug. Larger than a sweep.

- **Retire `createColorTween`.** _Parked — depends on seam._ Blessed (Decision #2): replace with generic color adapter once the seam exists.

- **Per-property easing.** _Parked — depends on seam._ `TweenOptions.ease` as `Partial<Record<keyof T, EasingFunction>>`; per-`TweenPropertyDetail.ease`. Builds on the per-property detail model the seam introduces.

- **Multi-keyframe / waypoints** (`createTweenKeyframes`). _Parked — depends on per-property detail._

- **Single-object tween timeline** (`createTweenSequence`/`createTweenParallel`). _Parked — larger scope._ Blessed (Decision #4): tween owns single-object sequencing. Position params, labels, nesting. Significant implementation scope; may share a primitive with `@flighthq/timeline`.

- **`@flighthq/clock` integration.** _Parked — new package._ Blessed (Decision #5): `@flighthq/clock` is the shared time primitive. Once it exists, tween adopts it as the time source, replacing raw `deltaTime` and per-entity `timeScale`. Cross-package.

- **`defaultManager` singleton.** _Parked — open direction._ May violate the "no magic" rule. Needs explicit ruling.

- **Geometry interpolator bridge.** _Parked — cross-package._ `Vector2`/`Vector3`/`Matrix` as registered adapters. Depends on the seam + a confirmed `@flighthq/geometry` dependency direction.

- **Snapping/overshoot refinement.** _Parked — depends on seam._ Per-property snap increment, `clampOvershoot`. Sequenced after per-property detail.

- **Performance pass.** _Parked — Gold-tier._ Pooling, swap-remove, benchmark. After the seam settles.

- **`@flighthq/tween-formats` neighbor.** _Parked — gated on consumer._ Declarative tween authoring import. No speculative build.

- **Rust `flighthq-tween` crate.** _Parked — global posture._ TS leads, Rust follows in parity passes.

- **Types-layout split.** _Parked — types-layout owner._ `NumericProps`/`TweenPropertyValue` sharing `Tween.ts` in `@flighthq/types` — candidate one-concept-per-file split.

- **Tighten `Tween<any>` generics.** _Parked — surface-shape judgement._ Whether `Tween<object>`/`unknown` would serve instead of `any` in the heterogeneous manager map.

## Approved

- [2026-07-02 · picked] Sweep items 1–4: onYoyo signal, unit-agnostic time docs, seekTween-to-end pin, fix onComplete doc comment
