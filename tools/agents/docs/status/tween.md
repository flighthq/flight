# @flighthq/tween — status

## 2026-06-25 — builder R2-4 second-pass recovery

Re-checked the items parked in the first pass now that a parallel pass had recovered ~94 lost types into `@flighthq/types`. Re-verified the specific blockers: `packages/types/src/` still has **no** `TweenPropertyValue.ts`, `Tween` still has **no** `onStart` field, and `TweenOptions` still lacks `repeatDelay`/`timeScale`. So the type-dependent parked items remain blocked. The boundary forbids editing `@flighthq/types`, so they stay parked.

### Recovered

- **`tweenProgress.ts` — whole module** (`getTweenProgress`, `invalidateTween`, `restartTween`, `seekTween`, `setTweenProgress`), with all doc comments preserved verbatim from `dist/`. Tests recovered into `tweenProgress.test.ts` (5 `describe` blocks, alphabetized). `export * from './tweenProgress'` added to `index.ts` (alphabetized, between `tweenManager` and `tweenStagger`).

  The first pass parked this transitively because `dist/tweenProgress.js`'s `seekTween` imports `initializeTweenByMode` from the parked `internal` enrichment. On reflection that import is a forward reference to capture-mode machinery that does not (and cannot, under this boundary) exist in the current codebase: the whole package operates in `to`-only mode, where `initializeTweenByMode` is behaviorally identical to the present `initializeTween` stub (both capture start from the live target and end from `propertyMap`). `tweenProgress` itself depends on **no blocked type** — only on an init function that exists. Recovered against `initializeTween`, which is the correct call in a `to`-only codebase rather than a behavior change (there is no from/fromTo path for it to honor). All `tweenProgress` tests use plain `to` tweens and pass.

### Still parked (unchanged from first pass — blocked by the HARD BOUNDARY on `@flighthq/types`)

- **`internal.ts` enrichment** — `getTweenInternal`, `setTweenInternal`, `initializeTweenByMode`, `initializeTweenFrom`, `initializeTweenFromTo`, `resolvePropertyEndValue`, and the `TweenInternal` / `TweenCaptureMode` types. Reason: needs `TweenPropertyValue` in `@flighthq/types` (relative-string `"+=N"` support; `NumericProps` is `?: number` only) and `onStart` on the `Tween` interface (every `initialize*` emits `tween.onStart`). Both still absent.
- **`tween.ts` — `createTweenFrom` / `createTweenFromTo`** — depend on the parked `internal` capture modes and on `Tween`/`TweenOptions` fields (`onStart`, `repeatDelay`, `timeScale`) that do not exist. Parked transitively.

All remaining parked items unblock together once `@flighthq/types` gains `TweenPropertyValue` and the `Tween`/`TweenOptions` fields — a single `@flighthq/types` change under separate review.

### Fossils skipped

None. Nothing remaining in tween `dist/` implements a deliberately-dropped concept.

### Tests

`npm run test --workspace=packages/tween` — **7 files, 110 tests, all pass** (was 6 files / 91; the recovered `tweenProgress` adds 1 file / 19 tests).

## 2026-06-25 — builder R2-4 lost-source recovery

Recovered lost source for `@flighthq/tween` by merging `dist/*.js` (impl + comments) with `dist/*.d.ts` (types), the validated "camera pattern". The integration curation had pruned several functions and a whole module out of `src/` even though `dist/` proves they compiled.

### Recovered

- **`tween.ts` — 4 functions added** into the existing file (the curation kept the module but dropped these exported functions):
  - `getActiveTweenCount(manager)` — total tween count across all targets.
  - `getTweensOf(manager, target)` — the tweens registered for a target (empty array sentinel, not throw).
  - `hasTweensOf(manager, target)` — boolean presence check.
  - `killTweensOfProperty(manager, key)` — mark every tween touching a property complete.
  - Plus their tests in `tween.test.ts` (4 new `describe` blocks, alphabetized between `createTween` and `pauseAllTweens`).
- **`tweenStagger.ts` — whole module recovered** (`createTweenStagger` + package-local `TweenStaggerOptions` interface; private `computeStaggerDelay` at the bottom). Batch-tweens an array of targets with staggered start delays (`start`/`center`/`end`/numeric-index distributions, optional `staggerEase`). Tests recovered into `tweenStagger.test.ts`. `export * from './tweenStagger'` added to `index.ts` (alphabetized).

`TweenStaggerOptions` is defined locally in the module (as it was in the dist `.d.ts`); it is consumed only by this module's own signature, so it is not a cross-package type that belongs in `@flighthq/types`.

### Parked (blocked by the HARD BOUNDARY — cannot edit `@flighthq/types`)

The richer "from / fromTo / capture-mode" tween feature set could not be restored without adding type surface to `@flighthq/types`, which is out of scope for this task:

- **`internal.ts` enrichment** — `dist/internal.js` contains `initializeTweenByMode`, `initializeTweenFrom`, `initializeTweenFromTo`, `getTweenInternal`, `setTweenInternal`, `resolvePropertyEndValue`, and the `TweenInternal` / `TweenCaptureMode` types. The current `src/internal.ts` is a pruned stub with only the basic `initializeTween`. The recovered version:
  - imports `TweenPropertyValue` from `@flighthq/types` — **that type does not exist** in `packages/types/src/` (no `TweenPropertyValue.ts`; `NumericProps` is `?: number` only, with no relative-string `"+=N"` support).
  - emits `tween.onStart` — **the `Tween` interface has no `onStart` field** (only `onComplete` / `onRepeat` / `onUpdate`).
  - Parked. Reason: needs `TweenPropertyValue` in `@flighthq/types` + `onStart` on `Tween`.
- **`tween.ts` — `createTweenFrom` / `createTweenFromTo`** — depend on the parked `internal` (`setTweenInternal`, capture modes) and on `makeTween` setting `onStart` / `repeatDelay` / `timeScale`, none of which exist on the current `Tween` / `TweenOptions` types. Parked transitively with `internal`.
- **`tweenProgress.ts`** (`getTweenProgress`, `invalidateTween`, `restartTween`, `seekTween`, `setTweenProgress`) — value-correct in isolation, but `seekTween` imports `initializeTweenByMode` from the parked `internal`. Recovering it as-is would dangle on a missing import; rewriting it to call the stub `initializeTween` would silently change behavior (would not honor from/fromTo capture). Parked with `internal` rather than guess.

All parked items unblock together once `@flighthq/types` gains `TweenPropertyValue` and the `Tween`/`TweenOptions` fields (`onStart`, `repeatDelay`, `timeScale`). That is a single `@flighthq/types` change under separate review.

### Fossils skipped

None. Nothing in the tween `dist/` implements a deliberately-dropped concept (DisplayObject traits, Loader, Stage setters, Bitmap/Video drops). Everything lost is genuine animation functionality.

### Tests

`npm run test --workspace=packages/tween` — **6 files, 91 tests, all pass.**
