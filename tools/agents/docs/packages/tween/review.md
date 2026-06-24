---
package: '@flighthq/tween'
status: solid
score: 76
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/tween.md
  - source
  - changes.patch
  - charter.md
---

# tween — Review

Evidence: `incoming/builder-67dc46d64/head/packages/tween/` + `changes.patch` (the diff touches only `packages/tween/**` and the four `packages/types/src/Tween*.ts` files). Findings reference `67dc46d64:<path>`. The prior depth review (`reviews/depth/tween.md`, verdict `solid — 64`) and the maturation roadmap (`reviews/maturation/depth/tween.md`, Bronze/Silver/Gold) both still exist and are absorbed here; this survey supersedes them. The charter is a `draft`-style stub — only "What it is" is filled in (and that line is itself seeded from the prior depth review); North star, Boundaries, Decisions, and Open directions are all `TODO` — so the AAA fallback (GSAP/TweenJS/anime/Actuate target, plus the codebase-map design constraints) supplies the bar.

## Verdict

`solid — 76/100`. The builder pass landed the entire Bronze tier and most of Silver's time-control slice: relative values, `from`/`fromTo`, `onStart`, `repeatDelay`, per-tween + per-manager `timeScale`, the manager-introspection quartet (`getActiveTweenCount`/`getTweensOf`/`hasTweensOf`/ `killTweensOfProperty`), the progress/seek/scrub family, and a stagger helper — 125 tests across 7 files, all verified present. This is a real, professional-grade property tweener. The 76 (above the prior 64, below the worker's self-estimated 82) reflects this review's distance-to-authoritative bar: the two largest depth gaps the roadmap names — the **value-interpolator seam** and a **programmatic timeline** — are both still absent, the **`createColorTween` proxy correctness bug** the prior review flagged is still live (and now also defeats the new `getTweensOf`/`killTweensOfProperty` queries), and the charter is a stub so nearly all of "what good means here" is assumed, not confirmed. The code is strong; the score is a survey of remaining distance, not a grade on the diff.

## Present capabilities (verified against source)

**Creation and capture modes** (`tween.ts`, `internal.ts`). `createTween` keeps its manager-bound/default-manager overload pair (`67dc46d64:tween.ts:41-84`). New this pass: `createTweenFrom` (explicit starts → live end values, `captureMode: 'from'`) and `createTweenFromTo` (both endpoints explicit, no live capture, `captureMode: 'fromTo'`), both routing through the shared `makeTween` core and a `WeakMap`-based `TweenInternal` extension (`setTweenInternal`/`getTweenInternal` in `internal.ts`). `initializeTweenByMode` dispatches the three capture modes at first update. `createTweenTimer` (`timer.ts`) and `applyTween` (instant set + overlap-cancel) are unchanged.

**Relative values** (`internal.ts:resolvePropertyEndValue`). `NumericProps<T>` values widened to `TweenPropertyValue = number | string`; `"+=N"`, `"-=N"`, `"*=N"` resolve against the captured start. Unrecognized relative syntax `throw`s a clear message (`67dc46d64:internal.ts:103-111`) — a correct programmer-error throw per the design constraint (misuse, not an expected-missing case).

**Manager + lifecycle** (`tweenManager.ts`, `updateTweens.ts`). `createTweenManager` now seeds `timeScale` (default `1`); `defaultManager` is an exported module-level singleton. `updateTweens` multiplies `deltaTime * manager.timeScale` before dispatch and compacts in place (reverse-walk `splice`, drops empty target lists). `updateTween` multiplies by per-tween `timeScale`, emits `onStart` after `initializeTweenByMode`, and on repeat resets `elapsed = delay - repeatDelay` so the initial delay and the per-cycle delay are independent (`67dc46d64:updateTweens.ts:54`). `completeTween` and the `stop*`/`pause*`/`resume*`/`reset*` scope-triple verbs are intact.

**Manager introspection** (`tween.ts`). `getActiveTweenCount` (sum over lists), `getTweensOf` (returns the live list or `[]` — sentinel-correct, not `null`), `hasTweensOf`, and `killTweensOfProperty` (marks `complete` on any tween whose `propertyMap` contains the key; no-op when none match). These close the roadmap's "query the manager" Bronze gap.

**Time control / scrubbing** (`tweenProgress.ts`). `getTweenProgress` (0 in delay phase, 1 when complete, single-cycle), `invalidateTween` (GSAP `invalidate` — drop captures, reset elapsed/complete), `restartTween(includeDelay?)`, `seekTween(tween, timeSeconds)` (absolute-time jump, clamps to `delay+duration`, applies immediately), and `setTweenProgress(tween, 0..1)` (delegates to `seekTween`). `seekTween` is alias-safe by buffering all reads into a `writes[]` array before writing the target.

**Stagger** (`tweenStagger.ts`). `createTweenStagger(manager, targets, duration, propertyMap, stagger?, options?)` batch-creates one tween per target with a computed per-index delay; `TweenStaggerOptions` covers `each`, `from` (`'start' | 'center' | 'end' | number`), and an optional `staggerEase` over the delay distribution. `computeStaggerDelay` handles all four `from` modes including the numeric-origin spread. Returns the tween array; empty-input returns `[]`.

**Color** (`colorTween.ts`). `createColorTween` interpolates `0xRRGGBB` in float `{r,g,b}` component space and writes a rounded packed int back via an `onUpdate` listener — domain-correct (interpolating the packed int directly would be wrong).

**Types** (`@flighthq/types`). `Tween<T>` gained `onStart`, `repeatDelay`, `timeScale`; `TweenOptions`/`TweenManagerOptions`/`TweenManager` gained the matching fields; `NumericProps<T>` and `TweenPropertyValue` are declared. Types-first ordering respected: the header fields landed before the implementation read them.

**Tests.** 125 `it`s across 7 `*.test.ts` (verified: tween 52, updateTweens 26, tweenProgress 19, tweenStagger 10, tweenManager 8, colorTween 5, timer 5) — up from the prior ~80. Covers alias-safe scrub, stagger ordering and all `from` modes, manager `timeScale`, relative values, and the `from`/`fromTo`/`onStart`/`repeatDelay` additions.

## Gaps (vs the AAA GSAP/TweenJS target; charter silent, so codebase-map standard applies)

- **No value-interpolator seam.** The roadmap's Silver keystone — a `TweenInterpolatorKind` + `TweenInterpolator` contract that color, vector, unit, and array interpolation all register against — does not exist. Color is still a one-off bolted-on function, not the first adapter on a general seam. This is the single highest-leverage missing piece: per-property easing, keyframes, and geometry bridges all depend on it.
- **`createColorTween` proxy bug is still live.** The tween is registered under the internal `{r,g,b}` proxy object, not the user's `target`, so `stopTweens(manager, userTarget)`, `getTweensOf(manager, userTarget)`, and the new `killTweensOfProperty(manager, 'color')` all miss it (the proxy's keys are `r/g/b`, not `color`). The prior review flagged the stop/overwrite half; the new query and kill-by-property functions inherit the same blind spot. A real correctness wrinkle that the interpolator seam is meant to retire.
- **No programmatic timeline.** No `createTweenSequence`/`createTweenParallel`, position parameters (`"<"`/`">"`/`"+=0.5"`), labels, or nested timelines. The roadmap calls this the second-largest depth gap and explicitly cross-package (the `@flighthq/timeline` boundary). Correctly deferred, but it is a real distance-to-authoritative gap.
- **No per-property easing.** A single `ease` applies to every property; no `Partial<Record<keyof T, EasingFunction>>` and no per-`TweenPropertyDetail.ease`. Depends on the adapter seam.
- **No multi-keyframe / waypoints.** No `createTweenKeyframes` to animate one property through a sequence of values. Depends on per-property detail.
- **No `onYoyo`/`onReverse` signal.** `reflect` flips `reverse` each cycle but there is no signal for the direction flip distinct from `onRepeat`. Small, self-contained, still absent.
- **No geometry interpolator bridge.** No first-class `Vector2`/`Vector3`/`Matrix` tweening; vectors are per-property-number juggling. Cross-package (`@flighthq/geometry`), depends on the seam.
- **Snapping/overshoot are coarse.** `snapping` is a boolean integer round; no per-property snap increment, no `clampOvershoot` guard for elastic/back eases.
- **Hot-path allocation.** `makeTween` calls `Object.keys(...).map(...)` per tween; `updateTween` iterates `properties` (no `Object.keys` in the loop — good) but allocates nothing per frame _except_ `seekTween`, which allocates a `writes[]` array (plus per-write objects) every scrub. No pooled `Tween`/`TweenPropertyDetail` (`acquire*`/`release*`), no swap-remove. Fine for typical counts; a 10k-concurrent benchmark is unmeasured.
- **No `-formats` neighbor and no Rust crate.** `@flighthq/tween-formats` (declarative authoring import) and the `flighthq-tween` crate are both correctly parked behind a stable seam.

## Charter contradictions

None — there is almost nothing to contradict. The charter's "What it is" line (property tweening with easing/delay/repeat/yoyo/callbacks and a multi-tween manager, GSAP/TweenJS/Actuate as reference) matches the code exactly. North star, Boundaries, and Decisions are all `TODO`, so there is no blessed rule to violate. The one soft tension worth surfacing: the prior depth review (the seed the charter line was lifted from) already flagged the `createColorTween` proxy mismatch and the `defaultManager` singleton as correctness/design wrinkles, and both are still present — so the package and its own seed-review disagree on whether those are acceptable. Not a charter violation (no charter rule exists), but the charter should settle them.

## Contract & docs fit

**Lives up to the contract:**

- **Full unabbreviated names** throughout (`createTweenManager`, `killTweensOfProperty`, `getActiveTweenCount`, `setTweenProgress`) — no abbreviated type words.
- **Sentinels, not throws, for expected-missing.** `getTweensOf` → `[]`, `hasTweensOf` → `false`, `killTweensOfProperty` no-ops when none match. `resolvePropertyEndValue` `throw`s only on genuine misuse (bad relative syntax) — exactly the design-constraint split.
- **Free functions over methods**, plain-data `Tween`/`TweenManager` entities, signals via `@flighthq/signals` for the multi-listener `onUpdate`/`onComplete`/`onRepeat`/`onStart` surface.
- **Types-first.** All cross-package types live in `@flighthq/types`; the implementation imports them.
- **Packaging.** `sideEffects: false`, single `.` export, deps limited to `easing`/`signals`/`types`. `internal.ts` is correctly kept out of the barrel (`index.ts` re-exports 7 modules, not `internal`), and `scripts/completeness.ts` explicitly skips `index.ts`/`internal.ts` — so its un-tested internal exports are **sanctioned**, not an `exports:check` violation (verified against the script). `crate: flighthq-tween` is declared in the charter front matter.
- **`seekTween` documents its alias-safety** and honors it (reads buffered before writes).

**Defects / candidate revisions:**

- **`createColorTween` registers the tween under the wrong target (correctness defect).** The tween's `target` is the internal `{r,g,b}` proxy (`67dc46d64:colorTween.ts:21-37`), so every manager query keyed by the user's object — `stopTweens`, `getTweensOf`, `hasTweensOf`, `killTweensOfProperty` — fails to see the color tween. This is a real behavioral bug, not just a style note, and it now silently defeats three of this pass's own new functions. The clean fix is the value-interpolator seam (color as a registered adapter writing the real target/key); a stopgap would register under the user target with a custom write step. Either way it needs a decision.
- **`defaultManager` is a module-level singleton constructed at import** (`67dc46d64:tweenManager.ts:15`). It allocates only an empty `Map` plus an easing reference, so it satisfies the side-effect-free rule technically, but it is shared mutable state — a stricter reading of the "no shared top-level mutable state" rule prefers explicit manager creation. The status doc flags this honestly; it is a convenience pattern the charter should bless or retire.
- **`NumericProps` and `TweenPropertyValue` share `Tween.ts` in `@flighthq/types`.** The types-layout convention is one-concept-per-file (filename = type name). `NumericProps<T>` and `TweenPropertyValue` are their own concepts and arguably want `NumericProps.ts` / `TweenPropertyValue.ts`. A candidate revision for the types-layout owner, not a `tween` defect (the file lives in `@flighthq/types`).
- **`Tween<any>`/`tweens: Map<object, Tween<any>[]>` loosen the otherwise-tight generic surface.** The `any` is pragmatic for the heterogeneous manager map and the scope verbs, but it leaks `any` into several public signatures (`getTweensOf` → `readonly Tween<any>[]`). Worth a note on whether `Tween<object>`/`unknown` would serve.
- **`Tween.onComplete`'s doc comment is wrong.** In `types/src/Tween.ts`, `onComplete` carries the comment "Fires once when the initial delay has elapsed and the tween begins its first active frame" — that is the `onStart` description copied onto the wrong field. `onComplete` fires on completion. A one-line doc fix in the header layer.
- **Package Map line is accurate** ("tween managers, tweens, and timers") and needs no revision — though it is now an undersell of the realized surface (from/fromTo, stagger, scrubbing). No action required; the map is intentionally terse.

## Candidate open directions (charter is a stub — these are the questions it should settle)

1. **North star.** What is the durable bar? Likely: a single value-interpolator seam so every value type (color/vector/unit/array) is one registered adapter; deterministic value-typed core suitable for the Rust mirror; sentinels for expected-missing, throws only on misuse. Confirm so future work is judged against it.
2. **The value-interpolator seam (fork B / fork A).** Bless `TweenInterpolatorKind` + `TweenInterpolator` as the keystone, with an open registry (`registerTweenInterpolator`) rather than hardcoded color. This is both the fix for the `createColorTween` bug and the foundation for per-property easing, keyframes, and the geometry bridge.
3. **Programmatic timeline boundary (cross-package).** Build a `createTweenSequence`/`createTweenParallel` timeline in `@flighthq/tween` (with position parameters, labels, nesting), or delegate programmatic sequencing to `@flighthq/timeline` and keep `tween` single-tween-only? The roadmap leans (a); it must be a deliberate, documented choice (touches `timeline`, `spritesheet`, `timeline-spritesheet`).
4. **`defaultManager` singleton.** Bless the import-time convenience singleton, or require explicit `createTweenManager()`? A shared-mutable-state design ruling.
5. **`createColorTween` fate.** Keep the back-compat shim rebuilt on the seam, or remove the bespoke function once the color adapter exists?
6. **Geometry interpolator bridge (cross-package).** Confirm the `tween → @flighthq/geometry` dependency direction and keep it adapter-gated so geometry is not pulled into tween-only bundles.
7. **Signals as an opt-in group (`enableTweenSignals`).** Move `onUpdate`/`onComplete`/`onStart`/`onYoyo` behind an `enable*` per the SDK signal-group rule, so a property-only manager pays no signal cost? Changes the public signal surface — coordinate with the SDK barrel and examples.
8. **`@flighthq/tween-formats` neighbor + Rust parity.** Approve/deny the declarative-authoring neighbor and the timing of the `flighthq-tween` crate (value-typed core is a good early conformance target once the seam settles).

## Notes for status verification (as-claimed → verified)

The worker status doc checks out against source. Verified: 125 tests across 7 files (counts above); all listed new exports present and exported (`createTweenFrom`/`FromTo`, the manager quartet, the five `tweenProgress` functions, `createTweenStagger`); `timeScale` multiplies in both `updateTween` and `updateTweens`; the `elapsed = delay - repeatDelay` repeat reset is in source; `resolvePropertyEndValue` throws on bad relative syntax. The status's own "Concerns" are accurate and worth keeping live: the `createColorTween` proxy mismatch (confirmed, and now broader than stated — it also defeats `killTweensOfProperty`), the `defaultManager` singleton, unit-agnostic time, and `seekTween`-to-end firing `onComplete`. The self-estimated 82 is optimistic against this review's distance-to-authoritative bar (the seam and timeline are the two largest gaps and both remain), but the _inventory_ it claims is real and the diff is clean and well-tested.
