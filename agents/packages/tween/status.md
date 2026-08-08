---
package: '@flighthq/tween'
updated: 2026-08-08
by: principal
---

# tween — Status

> Under 6,000 characters. `Open` is rewritten in place; `Log` is dated one-liners, newest on top.
> Session narration belongs in git, which already carries it with the diff attached.

## Open

Every item was re-checked against `packages/tween/src/` (and `packages/types/src/`) on 2026-08-08.
A file:line here is a claim about this tree, not about a session.

- **`createColorTween` is registered under the wrong target — a live bug.** It builds an internal
  `{ b, g, r }` object (`colorTween.ts:22`) and passes *that* to `createTween` (`:29`), writing back to
  the caller's property through an `onUpdate` connection. The manager therefore keys the tween by the
  proxy, so `stopTweens`, `pauseTweens`, `resumeTweens`, `getTweensOf`, and `hasTweensOf` all miss a
  colour tween when handed the user's real target. The fix is the interpolator seam below, not a patch.
- **No value-interpolator seam.** `TweenPropertyDetail` is `{ change, key, start }`
  (`types/src/TweenPropertyDetail.ts`) — scalars only. No `TweenInterpolator` or
  `TweenInterpolatorKind` exists anywhere in `packages/`, which is why colour is a proxy rather than a
  registered adapter and why there is no `Vector2` / `Vector3` / `Matrix` path.
- **No per-property easing.** `ease` lives on `Tween` (`types/src/Tween.ts:11`), not on
  `TweenPropertyDetail`, so every property in one tween shares a curve. Multi-keyframe waypoints
  (`createTweenKeyframes`) build on the same per-property detail and are likewise absent.
- **No relative values.** `NumericProps<T>` is `number`-valued (`types/src/Tween.ts:5`);
  `TweenPropertyValue` and the `"+=N"` / `"-=N"` / `"*=N"` syntax do not exist.
- **Stale comment names a field that does not exist.** `updateTweens.ts:61` lists `repeatDelay` among
  the unit-agnostic time values; there is no `repeatDelay` on `Tween`, `TweenOptions`, or anywhere in
  the source. The same paragraph is contradicted eight lines later by `seekTween(tween, timeSeconds)`
  (`tweenProgress.ts:49`), whose parameter name asserts the seconds the contract refuses to assume.
- **`seekTween` allocates per call.** It builds a `writes` array plus one `{ key, value }` object per
  property every time (`tweenProgress.ts:61-65`) to buy alias safety that a read-into-locals pass over
  the existing `properties` array would give for free. This is the scrub path, so it is called at
  timeline rates.
- **`updateTweens` removes finished tweens with `list.splice(i, 1)`** (`updateTweens.ts:70`), which is
  O(n) per removal inside the hot loop; swap-remove is the shape a pooled path would want.
- **No playback-rate or start hooks.** `timeScale` is absent from both `Tween` and `TweenManager`
  (`types/src/Tween.ts`, `types/src/TweenManager.ts`), and there is no `onStart` signal — `onComplete`,
  `onRepeat`, `onUpdate`, `onYoyo` are the whole set.
- **No `createTweenFrom` / `createTweenFromTo`.** `tween.ts` exports three `createTween` overloads only,
  so a tween whose *start* is explicit and whose end is the live value cannot be expressed.
- **No programmatic sequencing, and the boundary is still unruled.** `createTweenSequence`,
  `createTweenParallel`, position parameters, labels, and nested timelines do not exist. Whether they
  live here or in `@flighthq/timeline` is a cross-package decision to raise with the user before
  building — a tween timeline has no display-object coupling, which argues for here.
- **`defaultManager` is a module-level singleton built at import** (`tweenManager.ts:12`) — shared
  mutable state in a package declaring `"sideEffects": false`. It is cheap (a `Map` plus an easing
  reference), so this is a convention question, not a correctness one.

## Log

<!-- newest entry on top; one dated line each, naming what changed and where to look -->

- **2026-08-08** — Rewritten to the `Open` + `Log` contract. Two claims from the 2026-06-25 entry
  checked out **false**: the `onYoyo` signal was parked as a cross-boundary blocker, but it is on
  `Tween` (`types/src/Tween.ts:18`), created at `tween.ts:127`, and emitted on the reflect flip at
  `updateTweens.ts:51`; and `seekTween` / `setTweenProgress` / `tweenProgress.ts` were declared absent
  from the worktree, when the whole module is present with five exports. Going the other way, the
  2026-06-24 entry claimed `onStart`, `repeatDelay`, `timeScale`, `createTweenFrom`,
  `createTweenFromTo`, and relative-string property values as landed; none of them exist, so they are
  recorded above as gaps rather than history. The manager introspection and stagger from the same entry
  are real (`tween.ts:80-99`, `tweenStagger.ts:19`).
- **2026-06-25** — Unit-agnostic time contract written as durable comments at the two time boundaries.
- **2026-06-24** — Manager introspection, stagger, and the progress/scrub module added.
