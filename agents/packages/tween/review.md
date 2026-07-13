---
package: '@flighthq/tween'
status: solid
score: 68
updated: 2026-07-13
ingested:
  - charter.md
  - status.md
  - review.md (2026-06-24, continuity)
  - assessment.md
  - source
---

# tween — Review

Evidence: the live worktree `packages/tween/src/` (8 source files, 7 colocated test files, 116 `it`s) plus `packages/types/src/Tween*.ts` / `StopTweenOptions.ts` / `TweenPropertyDetail.ts`, judged against the fully-authored charter (2026-07-02, six blessed decisions). Supersedes the 2026-06-24 review, which scored the **incoming bundle** `builder-67dc46d64` at 76 — a surface that was never fully merged. This is the central fact of this re-review: commit `06a0c480` ("recover lost source") restored `tweenProgress.ts`, `tweenStagger.ts`, and the manager-introspection quartet, but the bundle's `createTweenFrom`/`createTweenFromTo`, relative values (`TweenPropertyValue`, `resolvePropertyEndValue`), `onStart`, `repeatDelay`, and per-tween/per-manager `timeScale` **do not exist in the live tree**. The 2026-06-25 status entry flagged exactly this divergence; it is still true today.

## Verdict

`solid — 68/100`. A clean, well-tested single-property tweener with manager scoping, scrubbing, stagger, and introspection — but the live surface is materially smaller than the one the review-of-record described, and several capabilities the charter explicitly places in scope (relative values, `timeScale`, `onStart`, from/fromTo) are absent. The 2026-07-02 Approved sweep landed in full (verified below). The score drops from 76 not because work regressed since that number was earned, but because that number was earned by a bundle that never fully landed; 68 is the live tree's distance to the charter's authoritative bar.

## Approved-sweep verification (2026-07-02, items 1–4)

All four landed:

1. **`onYoyo` signal** — `Tween.onYoyo: Signal<() => void>` in `types/src/Tween.ts`, created in `makeTween` (`tween.ts:129`), emitted at the `reflect` flip in `updateTween` (`updateTweens.ts:51`), three tests in `updateTweens.test.ts` (flip emits, no-reflect does not, emits each cycle).
2. **Unit-agnostic time docs** — durable comments atop the public `createTween` overload (`tween.ts:33-36`) and atop `updateTweens` (`updateTweens.ts:60-64`).
3. **`seekTween`-to-end pin** — comments on `seekTween`/`setTweenProgress` (`tweenProgress.ts:40-41,78`) plus tests: fires `onComplete` at exact `delay + duration`, does not fire just before the end, fires at `setTweenProgress(tween, 1)` (`tweenProgress.test.ts:121-186`).
4. **`onComplete` doc fix** — `types/src/Tween.ts` now reads "Fires once when the tween finishes its final cycle (after all repeats)."

## Present capabilities (verified against live source)

- **Creation** (`tween.ts`): `createTween` with the manager-bound/default-manager overload pair (brand-checked via `TweenManager.__brand`); `applyTween` (instant set + overlap cancel); `createTweenTimer` (`timer.ts`, empty-target duration timer). Options: `delay`, `ease`, `overwrite` (default true, per-property overlap cancel in `registerTween`), `reflect`, `repeat` (-1 = infinite), `reverse`, `smartRotation` (shortest-path ±180° in `initializeTween`), `snapping` (integer round).
- **Manager** (`tweenManager.ts`): `createTweenManager` (default ease `easeOutExponential`), exported `defaultManager` module singleton. Scope verbs: `pauseTween`/`pauseTweens`/`pauseAllTweens`, `resumeTween`/`resumeTweens`/`resumeAllTweens`, `stopTween` (singular, added `cfc5c53c`, with `StopTweenOptions.complete`/`sendEvent`), `stopTweens`/`stopAllTweens`, `resetAllTweens`, `completeTween`.
- **Introspection** (`tween.ts`): `getActiveTweenCount`, `getTweensOf` (→ `[]` sentinel), `hasTweensOf`, `killTweensOfProperty` (no-op when none match).
- **Update** (`updateTweens.ts`): `updateTweens` compacts completed tweens in place (reverse-walk `splice`, drops empty target lists) and drives `updateTween`: delay phase, ease, reverse, reflect flip + `onYoyo`, repeat decrement + `onRepeat`, `onComplete`.
- **Scrub family** (`tweenProgress.ts`): `getTweenProgress`, `invalidateTween` (GSAP `invalidate`), `restartTween(includeDelay?)`, `seekTween` (clamped absolute-time jump, alias-safe via buffered `writes[]`), `setTweenProgress` (0..1, delegates to `seekTween`).
- **Stagger** (`tweenStagger.ts`): `createTweenStagger` with `each`, `from` (`'start' | 'center' | 'end' | number`), `staggerEase`; `computeStaggerDelay` covers all four modes; `[]` on empty input.
- **Color** (`colorTween.ts`): `createColorTween` interpolates 0xRRGGBB in float `{r,g,b}` space, writes the rounded packed int via an `onUpdate` listener — domain-correct math, proxy-registration bug below.
- **Signals**: `onUpdate`/`onComplete`/`onRepeat`/`onYoyo` are unconditional entity fields — matches the blessed "signals are fundamental" decision (no `enable*` gate).
- **Tests**: 116 `it`s across 7 files (tween 40, updateTweens 28, tweenProgress 22, stagger 10, manager 6, color 5, timer 5), covering scrub pins, stagger modes, overlap-overwrite, infinite repeat, smartRotation.

## Gaps (vs the charter's in-scope list and the GSAP-class bar)

- **The value-interpolator seam** (charter Decision #1, the keystone) does not exist — no `TweenInterpolatorKind`/`TweenInterpolator`/`registerTweenInterpolator`. Everything below the fold (per-property easing, keyframes, geometry bridge, color adapter) waits on it.
- **`createColorTween` proxy bug still live** (`colorTween.ts:27-37`): the tween registers under the internal `{r,g,b}` components object, so `stopTweens`/`getTweensOf`/`hasTweensOf`/`killTweensOfProperty` keyed by the user's target all miss it. Charter Decision #2 already blesses the fix (retire into a seam adapter).
- **Lost-bundle features, all charter-in-scope, all absent live**: relative values (`"+=N"`/`"-=N"`/`"*=N"` via `TweenPropertyValue`), `createTweenFrom`/`createTweenFromTo`, `onStart` (named in Decision #3's core signal contract and Boundaries), `repeatDelay`, per-tween + per-manager `timeScale` (named in Boundaries). These were built, reviewed, and scored in bundle `67dc46d64` but never merged; restoring them is recovery, not new design — except `timeScale`, which now collides with the clock question below.
- **No single-object sequencing** — no `createTweenSequence`/`createTweenParallel`, position params, or labels, despite Decision #4 blessing tween as their home.
- **No per-property easing, no keyframes/waypoints** — both sequenced behind the seam.
- **`@flighthq/clock` now exists** (built, in the Package Map) but tween still consumes raw `deltaTime`; the charter says tween "will consume `@flighthq/clock` once that package exists" — that gate has opened and the integration is unstarted. This also reframes `timeScale` restoration: Decision #5 treats per-entity `timeScale` as the decomposition smell clock replaces.
- **Snapping/overshoot coarse** — boolean integer round only (charter Open direction #5).
- **Hot-path allocation** — `makeTween`'s `Object.keys().map()`, `seekTween`'s per-call `writes[]`, `splice` compaction, no pooling (charter Open direction #6, Gold-tier).
- **No `-formats` neighbor, no Rust crate** — both correctly parked (consumer-gated; TS-leads posture per Decision #6).

## Charter contradictions

No live code violates a blessed Decision or Boundary. But the charter **describes a surface the code does not have**: Boundaries list relative values, `timeScale`, and from/fromTo as in-scope-present-tense, North star #4 cites `resolvePropertyEndValue`'s throw behavior, and Decision #3 names `onStart` in the core signal contract — none of these exist in the live tree. The charter was authored against the reviewed bundle, so it is ahead of `main`. Worth a one-line charter note (user's gate) or simply closing the gap by restoring the features. The `defaultManager` singleton remains an Open direction (#1), not a violation.

## Contract & docs fit

**Lives up to the contract:** full unabbreviated names throughout; sentinels for expected-missing (`getTweensOf` → `[]`, `hasTweensOf` → `false`, `killTweensOfProperty`/`pauseTweens`/`stopTweens` no-op); free functions over plain-data entities; types-first (`Tween`/`TweenManager`/`TweenOptions`/`TweenPropertyDetail`/`StopTweenOptions` all in `@flighthq/types`); `sideEffects: false`, single `.` export, deps exactly `easing`/`signals`/`types`; `internal.ts` correctly outside the barrel; `seekTween` documents and honors alias-safety.

**Candidate revisions:**

- **`seekTween(tween, timeSeconds)` parameter name contradicts the unit-agnostic contract** the same file's neighbors document. Rename to `time` (positional — non-breaking).
- **Stale comment**: the `updateTweens` unit-agnostic comment (`updateTweens.ts:61`) cites `repeatDelay` among the duration fields, but no `repeatDelay` exists in the live surface. Fix the word or restore the feature.
- **`Tween<any>` looseness** — `tweens: Map<object, Tween<any>[]>` leaks `any` into `getTweensOf` and the scope verbs; two files carry `eslint-disable no-explicit-any`. Prior review's note stands.
- **Package Map**: `agents/index.md` lists `@flighthq/tween` with **no parenthetical description** — every neighbor in the Animation/simulation line has one. `agents/packages/map.md:89` ("tween managers, tweens, and timers") undersells the scrub/stagger/introspection surface. Both are candidate one-line refreshes.
- **`agents/packages/TODO.md:575`** flags tween "needs re-review (review 2026-06-24 < status 2026-06-25)" — resolved by this review; regenerate the index.

## Candidate open directions

Most former questions were settled by the 2026-07-02 direction session. New or reopened:

1. **Recover vs. rebuild the lost bundle features.** Restore `from`/`fromTo`, relative values, `onStart`, `repeatDelay` from the `67dc46d64` shape as-is, or fold them into the interpolator-seam build? Restoration is sweep-shaped; the seam is the keystone — sequencing is the user's call.
2. **`timeScale` vs. `@flighthq/clock`.** Clock now exists. Does tween still grow per-tween/per-manager `timeScale` (Boundaries say yes) or skip straight to clock adoption (Decision #5 calls per-entity `timeScale` the smell clock removes)? The two blessed texts now point different directions.
3. **Charter drift note.** Whether to annotate the charter that its Boundaries describe the target surface (bundle shape), not the live tree, until restoration lands.
