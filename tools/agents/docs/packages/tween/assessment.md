---
package: '@flighthq/tween'
updated: 2026-06-24
basedOn: ./review.md
---

# tween — Assessment

Sorted from `review.md` (score `solid — 76`), absorbing the prior `reviews/maturation/depth/tween.md` Bronze/Silver/Gold roadmap (its Bronze tier has now largely shipped; the remaining Silver/Gold items are re-sorted here). The charter is a stub — North star, Boundaries, Decisions all `TODO` — so most of "what good means here" is an open design question, which keeps `Recommended` deliberately small. The package's two largest remaining gaps (the value-interpolator seam and the programmatic timeline) and its live `createColorTween` correctness bug are all either design forks or cross-package, so they are routed to the charter's Open directions, not into `Recommended`. The genuinely sweep-safe set is the small, self-contained additions that need no decision and touch only `@flighthq/tween` source.

## Recommended

Strictly sweep-safe: within `@flighthq/tween`, no cross-package coupling, no breaking change, no open design decision.

- **Add the `onYoyo` (direction-flip) signal.** `reflect` already flips `tween.reverse` each repeat cycle in `updateTween` (`67dc46d64:updateTweens.ts:50`); add a `Tween.onYoyo` signal and `emitSignal` it at that flip, distinct from `onRepeat`. The `Tween` interface field lands in `@flighthq/types` first (one field, same pattern as the just-added `onStart`), then a one-line emit and a colocated test. Self-contained, no design decision, no behavior change to existing paths. — review.md (Gaps: "No `onYoyo`/`onReverse` signal").

- **Document the unit-agnostic time contract in source.** Time values (`delay`, `repeatDelay`, `each`, `duration`, `seekTween`'s `timeSeconds`) pass through unchanged in whatever unit the caller feeds `updateTweens` — there is no seconds assumption. The status doc flags this as a user-surprise. Add a durable semantic comment at the package boundary (e.g. atop `updateTweens` / the `duration` params) stating the unit is caller-defined and must be consistent. Pure in-source doc; no signature change. — review.md (Notes for status verification: unit-agnostic time).

- **Pin the `seekTween`-to-end completion behavior with a test + comment.** `seekTween(tween, delay+duration)` and `setTweenProgress(tween, 1)` mark the tween complete and fire `onComplete` (`67dc46d64:tweenProgress.ts:77-80`). This is the intended behavior but is an easy footgun for scrub-to-end-without-completing. Document it on `seekTween`/`setTweenProgress` and add a colocated test asserting both the fire-on-exact-end and the "scrub to `duration - epsilon` does not complete" cases, so the policy is enforced rather than incidental. Within-package, no design change. — review.md (Notes for status verification: `seekTween`-to-end).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **Value-interpolator seam** (`TweenInterpolatorKind` + `TweenInterpolator` contract in `@flighthq/types`; `registerTweenInterpolator`; color rebuilt as the first registered adapter). **Parked:** this is the package's keystone API-shape decision (open registry per fork B, new types in the header layer) and the prerequisite for per-property easing, keyframes, and the geometry bridge — not sweep-safe. Routed to Open directions.

- **Fix the `createColorTween` proxy mis-registration.** The color tween registers under the internal `{r,g,b}` proxy, so `stopTweens`/`getTweensOf`/`hasTweensOf`/`killTweensOfProperty` keyed by the user target all miss it. **Parked:** the clean fix _is_ the interpolator seam (a design decision); a stopgap that re-homes the registration under the user target is a behavioral change that should be made once the seam's shape is decided, not independently. Routed to Open directions alongside the seam.

- **Per-property easing** (`TweenOptions.ease` as `Partial<Record<keyof T, EasingFunction>>`; per-`TweenPropertyDetail.ease`). **Parked:** builds on the value-adapter seam's per-property detail model — doing it before the seam means doing it twice. Waits on the seam decision.

- **Multi-keyframe / waypoints** (`createTweenKeyframes`). **Parked:** depends on per-property detail, which depends on the seam. Waits on the seam.

- **Programmatic tween timeline** (`createTweenSequence`/`createTweenParallel`, position parameters, labels, nested timelines, timeline-level `timeScale`/`repeat`/progress). **Parked:** explicitly a cross-package boundary decision with `@flighthq/timeline` (and conceptually `spritesheet`/ `timeline-spritesheet`); the second-largest depth gap and far larger than a sweep. Routed to Open directions.

- **Geometry interpolator bridge** (`Vector2`/`Vector3`/`Matrix` as registerable adapters via a thin `tween ↔ @flighthq/geometry` seam). **Parked:** cross-package — adds a `@flighthq/geometry` dependency whose direction must be confirmed and kept adapter-gated. Depends on the seam. Routed to Open directions.

- **`enableTweenSignals` opt-in signal group.** Move `onUpdate`/`onComplete`/`onRepeat`/`onStart`/ `onYoyo` behind an `enable*` per the SDK signal-group rule. **Parked:** changes the public signal surface (a breaking reshape) and must coordinate with the SDK barrel and any examples reading `tween.onComplete` directly. Routed to Open directions.

- **`defaultManager` singleton: bless or retire.** The import-time module singleton is shared mutable state. **Parked:** a design ruling for the charter (convenience vs. strict explicit-creation), not a unilateral change.

- **Snapping config + overshoot clamp** (`snap?: boolean | Partial<Record<keyof T, number>>`, `clampOvershoot`). **Parked:** the per-property `snap` form changes the `TweenOptions.snapping` field shape (a types decision) and overlaps the per-property-detail model the seam introduces. Better sequenced with the seam than swept now.

- **Performance pass** (pooled `Tween`/`TweenPropertyDetail` via `acquire*`/`release*`, swap-remove instead of `splice`, drop `seekTween`'s `writes[]` allocation, 10k-concurrent benchmark with a committed baseline). **Parked:** larger than a sweep, affects the representation the Rust mirror ports, and benchmarking needs a baseline harness. Gold-tier.

- **`@flighthq/tween-formats` neighbor** (declarative tween/timeline descriptor import). **Parked:** a new package — needs the bedrock/plurality test, a Package Map entry, a charter pass, and `npm run packages:check` alignment. Cross-package scope expansion. Routed to Open directions.

- **`flighthq-tween` Rust crate.** **Parked:** correctly trails the TS seam — only mirror once the interpolator seam and timeline shape are stable. Gold-tier, cross-worktree.

- **Split `NumericProps` / `TweenPropertyValue` out of `Tween.ts`; fix the `onComplete` doc comment.** Both live in `@flighthq/types`, not `@flighthq/tween`. **Parked:** these are candidate revisions for the types-layout owner (one-concept-per-file) and a one-line header doc fix in the types package — not within a `tween` sweep. Surfaced here so they are not lost; the owner is `@flighthq/types`.

- **Tighten the `Tween<any>` / `Map<object, Tween<any>[]>` generics.** **Parked:** the `any` is pragmatic for the heterogeneous manager map and the scope-verb signatures; whether `Tween<object>`/`unknown` serves is a surface-shape judgement worth a deliberate look, not an incidental sweep.

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The review enumerates these; the assessment confirms they are the forks that keep the bulk of the backlog parked:

1. **North star** — confirm the durable bar (single value-interpolator seam; deterministic value-typed core for the Rust mirror; sentinels for expected-missing, throws only on misuse).
2. **Value-interpolator seam (fork A/B)** — bless `TweenInterpolatorKind` + `TweenInterpolator` as an open registry; this is both the `createColorTween` bug fix and the foundation for per-property easing, keyframes, and the geometry bridge.
3. **Programmatic timeline boundary** — build the tween timeline in `@flighthq/tween`, or delegate programmatic sequencing to `@flighthq/timeline`? (cross-package: timeline / spritesheet / timeline-spritesheet).
4. **`defaultManager` singleton** — bless the import-time convenience, or require explicit `createTweenManager()`?
5. **`createColorTween` fate** — keep a back-compat shim rebuilt on the seam, or remove it once the color adapter exists?
6. **Geometry interpolator bridge** — confirm the `tween → @flighthq/geometry` dependency direction; keep it adapter-gated.
7. **`enableTweenSignals` opt-in group** — move the signal surface behind an `enable*` so a property-only manager pays no signal cost? (public-surface reshape).
8. **`@flighthq/tween-formats` neighbor + Rust crate timing** — approve/deny the authoring neighbor and the value-typed crate as an early conformance target once the seam settles.
