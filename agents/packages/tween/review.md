---
package: '@flighthq/tween'
status: solid
score: 65
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - assessment.md
  - source
---

# tween — Review

Evidence: the live worktree `packages/tween/src/` (8 source files, 7 colocated test files, 118 `it`s across 1,754 lines) plus `packages/types/src/Tween*.ts` / `StopTweenOptions.ts` / `TweenPropertyDetail.ts` (7 type files), judged against the charter (2026-07-02, six blessed decisions) and the status rewrite (2026-08-08). Supersedes the 2026-07-13 review (68/100).

## Verdict

`solid -- 65/100`. The live surface is a clean, well-tested single-property tweener with manager scoping, scrub/seek, stagger, and introspection. What it ships is well built. But the gap between the charter's blessed scope and the live code has widened since the last review: `@flighthq/clock` now exists and the charter gate for clock integration has opened, yet tween still consumes raw `deltaTime`. The value-interpolator seam -- the charter's keystone decision -- remains unstarted, and the lost-bundle features (`createTweenFrom`/`createTweenFromTo`, relative values, `onStart`, `repeatDelay`, `timeScale`) remain absent. Two unit-naming issues (`seekTween`'s `timeSeconds` parameter, `TweenStaggerOptions.each` doc citing "seconds") contradict the unit-agnostic contract that the package's own durable comments establish. The `createColorTween` proxy bug persists. The score drops from 68 because the clock gate opening is a new gap measured against the charter, and the stale naming/doc issues remain unfixed.

## Present capabilities (verified against live source)

- **Creation** (`tween.ts`): `createTween` with the manager-bound/default-manager overload pair (brand-checked via `TweenManager.__brand`); `applyTween` (instant property set + overlap cancel); `createTweenTimer` (`timer.ts`, empty-target duration timer). Options: `delay`, `ease`, `overwrite` (default true, per-property overlap cancel in `registerTween`), `reflect`, `repeat` (-1 = infinite), `reverse`, `smartRotation` (shortest-path within +-180 degrees in `initializeTween`), `snapping` (integer round).
- **Manager** (`tweenManager.ts`): `createTweenManager` (default ease `easeOutExponential`), `defaultManager` module-level singleton (contract-only -- not in `index.ts`). Scope verbs: `pauseTween`/`pauseTweens`/`pauseAllTweens`, `resumeTween`/`resumeTweens`/`resumeAllTweens`, `stopTween` (with `StopTweenOptions.complete`/`sendEvent`), `stopTweens`/`stopAllTweens`, `resetAllTweens`, `completeTween` (in `updateTweens.ts`).
- **Introspection** (`tween.ts`): `getActiveTweenCount`, `getTweensOf` (sentinel `[]`), `hasTweensOf` (sentinel `false`), `killTweensOfProperty` (no-op when none match). Sentinels match charter North star #4.
- **Update** (`updateTweens.ts`): `updateTweens` compacts completed tweens via reverse-walk `splice`, drops empty target lists, and drives `updateTween`: delay phase, ease application, reverse, reflect flip + `onYoyo` emission, repeat decrement + `onRepeat`, `onComplete`.
- **Scrub family** (`tweenProgress.ts`): `getTweenProgress` (0..1), `invalidateTween` (GSAP `invalidate` -- contract-only, absent from `index.ts`), `restartTween(includeDelay?)`, `seekTween` (clamped absolute-time jump, alias-safe via buffered `writes[]`), `setTweenProgress` (0..1, delegates to `seekTween`).
- **Stagger** (`tweenStagger.ts`): `createTweenStagger` with `each`, `from` (`'start' | 'center' | 'end' | number`), `staggerEase`. Private `computeStaggerDelay` handles all four `from` modes. Empty input returns `[]`.
- **Color** (`colorTween.ts`): `createColorTween` interpolates 0xRRGGBB in float `{r,g,b}` space, writes the rounded packed int back via an `onUpdate` listener. Domain-correct math; proxy-registration bug documented below.
- **Signals**: `onUpdate`/`onComplete`/`onRepeat`/`onYoyo` are unconditional entity fields created in `makeTween`. This matches the blessed "signals are fundamental" decision (charter Decision #3) -- no `enable*` gate. `onStart` is named in the charter's core signal contract but is absent from the live surface.
- **Export lanes**: `index.ts` re-exports 26 symbols from `contract.ts`. `contract.ts` re-exports all 7 source modules. `invalidateTween` is contract-only (available to other `@flighthq/*` packages but not in the public API). `defaultManager` is also contract-only. `internal.ts` (`initializeTween`) is correctly excluded from both barrels.
- **Tests**: 118 `it`s across 7 files (tween 40, updateTweens 30, tweenProgress 22, stagger 10, manager 6, color 5, timer 5). Coverage includes scrub-to-end completion pins, all four stagger modes, overlap-overwrite semantics, infinite repeat, `smartRotation` shortest-path, zero-duration edge case, negative `deltaTime` guard, `stopTween` with `complete`/`sendEvent` combinations, and `completeTween` on uninitialized tweens.

## Gaps (vs the charter's in-scope list and the GSAP-class bar)

- **The value-interpolator seam** (charter Decision #1, the keystone) does not exist. No `TweenInterpolatorKind`, `TweenInterpolator`, or `registerTweenInterpolator` type or function anywhere in `packages/`. Per-property easing, keyframes, the geometry bridge, and the color adapter retirement all wait on it.
- **`createColorTween` proxy bug** (`colorTween.ts:22-37`): `createTween` is called with the internal `{ r, g, b }` components object as the target, not the user's object. The manager keys the tween by this proxy, so `stopTweens(manager, userTarget)`, `getTweensOf(manager, userTarget)`, `hasTweensOf(manager, userTarget)`, and `killTweensOfProperty(manager, key)` all miss color tweens. Charter Decision #2 blesses the fix (retire into a seam adapter); the seam is the prerequisite.
- **Lost-bundle features, all charter-in-scope, all absent**: relative values (`"+=N"`/`"-=N"`/`"*=N"` via `TweenPropertyValue`), `createTweenFrom`/`createTweenFromTo`, `onStart` signal (named in Decision #3's core signal contract and the Boundaries list), `repeatDelay`, per-tween + per-manager `timeScale`. These were built and reviewed in a bundle that never fully merged. `timeScale` now collides with the clock question below.
- **`@flighthq/clock` integration not started.** The clock package now exists with `createClock`, `advanceClock`, hierarchical scale/pause, and `onTick`. The charter states tween "will consume `@flighthq/clock` for time source abstraction once that package exists" -- that gate is now open. `updateTweens` still takes raw `deltaTime`. Decision #5 identified per-entity `timeScale` as the decomposition smell clock removes, yet neither path (per-entity `timeScale` or clock adoption) has advanced.
- **No single-object sequencing** -- `createTweenSequence`, `createTweenParallel`, position parameters, and labels are all absent despite Decision #4 placing them in tween's scope.
- **No per-property easing, no keyframes/waypoints** -- both depend on the seam and per-property detail that does not exist.
- **Snapping/overshoot coarse** -- boolean integer round only (`snapping: true` calls `Math.round`). No per-property snap increment, no `clampOvershoot` guard. Charter Open direction #5.
- **Hot-path allocation** -- `makeTween` builds `properties` via `Object.keys(propertyMap).map()` (two temporary arrays); `seekTween` allocates a `writes[]` array plus one `{ key, value }` object per property on every call; `updateTweens` compacts via `list.splice(i, 1)` (O(n) per removal). No pooling. Charter Open direction #6 (Gold-tier, after the seam settles).

## Charter contradictions

No live code contradicts a blessed Decision in behavior. However, the charter's text describes a surface the code does not have:

- **Boundaries list** relative values, `timeScale`, `createTweenFrom`/`createTweenFromTo` as in-scope present tense. None exist.
- **North star #4** cites `resolvePropertyEndValue`'s throw behavior. No such function exists.
- **Decision #3** names `onStart` in the core signal contract. The type and implementation have four signals; `onStart` is not among them.
- **Charter intro** says tween "will consume `@flighthq/clock`...once that package exists." Clock exists. Tween has no clock dependency.
- **`defaultManager` singleton** (`tweenManager.ts:12`) -- `createTweenManager()` called at module top level, producing a module-scoped mutable `Map`. Charter Open direction #1 acknowledges this tension with the "no magic" rule. It is cheap and arguably side-effect-free (allocates an empty `Map` + function reference), but it is shared mutable state in a `"sideEffects": false` package. Not a violation (it is an acknowledged open direction), but the convention question remains unresolved.

## Contract & docs fit

**Consistent with the codebase contract:**

- Full unabbreviated type names in every exported function name (`createTweenManager`, `killTweensOfProperty`, `getActiveTweenCount`, `createTweenStagger`).
- Sentinels for expected-missing cases: `getTweensOf` returns `[]`, `hasTweensOf` returns `false`, `killTweensOfProperty` / `pauseTweens` / `stopTweens` no-op silently.
- Free functions over plain-data entities with no class hierarchies.
- All types (`Tween`, `TweenManager`, `TweenOptions`, `TweenPropertyDetail`, `TweenStaggerOptions`, `StopTweenOptions`, `TweenManagerOptions`, `NumericProps`) live in `@flighthq/types`.
- `sideEffects: false` declared; two export lanes (`.` and `./contract`); deps exactly `easing`/`signals`/`types`.
- `internal.ts` excluded from both barrels.
- `seekTween` documents and honors alias-safety (reads all start/change into a buffer before writing target).
- `Readonly<T>` applied to all options-bag parameters and `propertyMap` inputs.

**Issues to address:**

- **`seekTween(tween, timeSeconds)` parameter name** (`tweenProgress.ts:49`) contradicts the unit-agnostic time contract that the same file's JSDoc and `updateTweens.ts:60-64`'s durable comment establish. Rename to `time`.
- **`TweenStaggerOptions.each` doc** (`types/src/TweenStaggerOptions.ts:5`) reads "Delay in seconds between each target's tween start." The "in seconds" wording contradicts the unit-agnostic contract. Should read "Delay between each target's tween start" (unit matches whatever `updateTweens` receives).
- **Stale comment** in `updateTweens.ts:61` cites `repeatDelay` among the unit-agnostic fields. No `repeatDelay` exists on `Tween`, `TweenOptions`, or anywhere in the live surface.
- **`Tween<any>` looseness** -- `tweens: Map<object, Tween<any>[]>` in `TweenManager` leaks `any` into `getTweensOf`, the scope verbs, and the scrub family; two source files carry `eslint-disable no-explicit-any`. Whether `Tween<object>` or `Tween<unknown>` would serve instead is an unresolved surface-shape question (assessment backlog item).
- **`completeTween` lives in `updateTweens.ts`** rather than alongside the other single-tween verbs (`stopTween`, `pauseTween`, `resumeTween`) in `tween.ts`. File placement is an organizational choice, not a bug, but the asymmetry is noticeable -- every other single-tween lifecycle verb is in `tween.ts`.

## Candidate open directions

1. **Interpolator seam build.** The keystone: `TweenInterpolatorKind` + `TweenInterpolator` registry, color as first adapter, numeric zero-overhead path. Unblocks per-property easing, keyframes, geometry bridge, and retires the `createColorTween` proxy bug. The single highest-leverage remaining piece. Design session needed for the type shape, registration API, and performance contract.

2. **Recover lost-bundle features.** `createTweenFrom`/`createTweenFromTo`, relative values, `onStart`, `repeatDelay`. These are charter-in-scope and were previously built. Whether to restore as-is or fold into the seam build is a sequencing decision.

3. **`timeScale` vs `@flighthq/clock` adoption.** Clock now exists with hierarchical scale/pause. Charter Decision #5 treats per-entity `timeScale` as the decomposition smell clock removes. Two paths: (a) add `timeScale` to `Tween`/`TweenManager` as a near-term completeness measure, then migrate to clock; (b) skip `timeScale` and integrate clock directly. The charter's Boundaries (which list `timeScale` in scope) and Decision #5 (which calls it a smell) currently point in opposite directions.

4. **Single-object sequencing.** `createTweenSequence`/`createTweenParallel` with position parameters and labels. Blessed by Decision #4 as tween's responsibility. Whether it shares a sequencing primitive with `@flighthq/timeline` is an open design question.

5. **Unit-naming cleanup.** Rename `seekTween`'s `timeSeconds` parameter to `time`; fix `TweenStaggerOptions.each` doc to drop "in seconds"; remove `repeatDelay` from the `updateTweens` comment. All three are one-line changes that bring docs and parameter names in line with the established unit-agnostic contract.

6. **`defaultManager` ruling.** The module-level singleton is an acknowledged open direction. Ruling needed: keep it (GSAP global-timeline convention), remove it (strict "no magic" rule), or gate it behind an explicit `getDefaultTweenManager()` accessor.
