---
package: '@flighthq/tween'
updated: 2026-07-02
basedOn: ./review.md
---

# tween — Assessment

Sorted from the depth review (76/100, solid), the builder's landed expansion (125 tests across 7 files), and the direction session (2026-07-02). Six decisions blessed. The package is a professional-grade property tweener with broad coverage. The two largest remaining gaps — the value-interpolator seam and the programmatic timeline — are both design decisions now blessed in the charter, ready for implementation. The sweep items are small, self-contained additions.

## Recommended

Sweep-safe: within `@flighthq/tween` (and one field in `@flighthq/types`), no cross-package coupling, no breaking change, no open design decision.

1. **Add the `onYoyo` (direction-flip) signal.** `reflect` already flips `tween.reverse` each repeat cycle in `updateTween`. Add a `Tween.onYoyo` signal field in `@flighthq/types` (same pattern as the existing `onStart`), emit it at the flip point, distinct from `onRepeat`. One field + one-line emit + colocated test.

2. **Document the unit-agnostic time contract in source.** Time values (`delay`, `repeatDelay`, `duration`, `seekTween`'s `timeSeconds`, `createTweenStagger`'s `each`) pass through unchanged in whatever unit the caller feeds `updateTweens`. Add durable semantic comments at the package boundaries (atop `updateTweens` and `createTween`) stating the unit is caller-defined and must be consistent. (Builder Phase 3 may have partially done this — verify.)

3. **Pin the `seekTween`-to-end completion behavior with a test + comment.** `seekTween(tween, delay+duration)` and `setTweenProgress(tween, 1)` mark the tween complete and fire `onComplete`. This is intended but an easy footgun. Document it on `seekTween`/`setTweenProgress` and add tests asserting both fire-on-exact-end and scrub-to-`duration - epsilon`-does-not-complete.

4. **Fix the `Tween.onComplete` doc comment.** In `types/src/Tween.ts`, `onComplete` carries the `onStart` description copied onto the wrong field. One-line fix.

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
