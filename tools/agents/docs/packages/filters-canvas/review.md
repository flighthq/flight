---
package: '@flighthq/filters-canvas'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - source
  - changes.patch (packages/filters-canvas slice + integration lint report)
---

# Review: @flighthq/filters-canvas — MERGE GATE (delta only)

> Harsh merge-review of the **incoming change** (head `integration-b2824e3d8`) against the **approved baseline** (`origin/main eb73c3d74`). Only the delta is judged — the base 3-leaf CSS package is the blessed floor and is not under review. Every objection is grounded in a cited `b2824e3d8:<path>` hunk.

## What the delta actually is

The base package is three CSS-only leaves (`applyBlurFilterToCanvas`, `applyDropShadowFilterToCanvas`, `applyOuterGlowFilterToCanvas`) over `@flighthq/filters-css`, with no `@flighthq/filters-surface` dependency and no pixel bridge. The delta adds:

- `canvasFilterDispatch.ts` — two new exports: `applyCanvasFilter` (a 14-arm closed `switch(filter.kind)` convenience dispatcher) and `canUseCanvasFilterCssFor` (a CSS-expressibility predicate).
- `testHelper.ts` — a test-only `makeDestCtxMock` / `stubOffscreenCanvas`, not exported from the barrel.
- `index.ts` — re-exports the two new functions.
- `canvasFilterDispatch.test.ts` — colocated tests for both new exports.

`package.json` is **byte-identical** to base (`b2824e3d8:packages/filters-canvas/package.json` diff = none). Critically, the delta did **not** add a `@flighthq/filters-surface` dependency, so the dispatcher cannot delegate pixel math — it degrades every non-CSS filter to a bare `drawImage` pass-through.

> **Note on prior docs.** The pre-existing `assessment.md`/`status.md` describe a "solid 84/100" package with all 14 `apply*FilterToCanvas` leaves, a zero-copy `ImageData`↔`Surface` bridge, scratch pooling, and a `filters-surface` delegation. That describes a _different branch_ (`builder-67dc46d64`), **not** `origin/main` and **not** this integration head. The integration state under review is materially leaner than those docs imply; this review re-baselines against what is actually in the head bundle.

## Hard blocker — the delta does not build in the integrated tree

**B1. `canvasFilterDispatch.ts` imports symbols that do not resolve in the integrated tree.** `b2824e3d8:packages/filters-canvas/src/canvasFilterDispatch.ts:1-7`:

```ts
import {
  computeBlurFilterCss,
  computeDropShadowFilterCss,
  computeOuterGlowFilterCss,
  createSvgFilterDataUri,
  svgFeColorMatrix,
} from '@flighthq/filters-css';
```

`createSvgFilterDataUri` and `svgFeColorMatrix` are re-exported by `filters-css/index.ts` from `./svgFilterUrl`, but **`svgFilterUrl.ts` is absent from the head bundle** (head `filters-css/src/` contains only the three `css*Filter` files + `index.ts`). The integration lint report embedded at the top of `changes.patch` confirms the merge is broken in two ways:

- `packages/filters-css/src/index.ts` → `4:0 error Parsing error: Merge conflict marker encountered`
- `packages/filters-canvas/src/canvasFilterDispatch.test.ts` → `Unable to resolve path to module './canvasFilterDispatch'` / `'./testHelper'`

So the new `ColorMatrixFilter` arm (`b2824e3d8:canvasFilterDispatch.ts:75-84`) is wired to a dependency that does not exist in the merged state. The root cause is a cross-package merge conflict in `filters-css`, but the _consuming_ code is in this package and the dispatcher is non-functional until `filters-css` ships `svgFilterUrl.ts` (the SVG `feColorMatrix` builder + the data-URI helper). **This is a merge blocker, not a within-package nit.** A green build of this delta is impossible until the filters-css side lands.

## Per-axis verdict (delta vs the 7 standards)

### 1. Composition / bedrock — FAIL (delta)

The dispatcher re-implements, verbatim, the save/filter/drawImage/restore body that already lives in the three base leaves instead of composing them. Compare `b2824e3d8:canvasFilterDispatch.ts:42-46` (the `BlurFilter` arm) with the base leaf `applyBlurFilterToCanvas` — the same four statements. The dispatcher imports `computeBlurFilterCss` directly and rebuilds the draw rather than calling `applyBlurFilterToCanvas`. Three of the four real arms (Blur/DropShadow/OuterGlow) are copy-paste of existing leaves; the convenience layer should be a thin re-router over the bedrock leaves — which is also exactly what the charter North star demands ("a thin, separable re-router, not the entry point"). Within-unit decomposition smell: the primitives exist and were not reused.

### 2. Naming clarity — PASS

`applyCanvasFilter` and `canUseCanvasFilterCssFor` are unabbreviated, self-identifying, and use the correct `can*` boolean form. `testHelper.ts` is the one wobble (see axis 7).

### 3. Tree-shaking / bundle invariant — PASS, with a within-unit caveat

`sideEffects: false` preserved, single `.` export preserved, no top-level side effects. The 14-arm dispatcher pulls all 14 arms' imports for any importer, and three of those arms duplicate code already exposed as importable leaves — but a single-filter user can still import one `apply*FilterToCanvas` leaf, so the "assembly never taxes a primitive" invariant holds at package granularity. Not a hard fail; the composition smell from axis 1 re-seen as a bundle concern.

### 4. Registry vs closed union (fork B) — NOT A BLOCKER (open question)

`applyCanvasFilter` is a 14-arm closed `switch(filter.kind)` (`b2824e3d8:canvasFilterDispatch.ts:35-101`). The filter family is the canonical growth surface the codebase map calls out — exactly the case fork B says to revisit on growth — but the dispatcher is not a hot loop (once per filter application), and the charter's Open directions #6/#7 already leave this **undecided**, leaning toward "closed is fine when not hot." Per the merge-gate rule I do not manufacture a must-fix from an unsettled fork; routed to Open questions.

### 5. Subject triad + plurality guard — PASS

No mis-homed format/backend code. `filters-canvas` is the correct `<subject>-<backend>` cell; nothing in the delta belongs elsewhere.

### 6. Contract hygiene — PARTIAL

- **`Readonly<>` opt-out without cause.** `b2824e3d8:canvasFilterDispatch.ts:77`: `svgFeColorMatrix(f.matrix as number[])`. `ColorMatrixFilter.matrix` is `ReadonlyArray<number>` (confirmed in `types/src/ColorMatrixFilter.ts`); the `as number[]` casts away `Readonly` for a value only read. Default-to-`Readonly` says drop the cast (the callee should take `ReadonlyArray<number>`).
- **Expressibility knowledge duplicated, not delegated.** `b2824e3d8:canvasFilterDispatch.ts:114-118`: `canUseCanvasFilterCssFor` re-derives blur isotropy with a hardcoded default — `const bx = f.blurX ?? 4; const by = f.blurY ?? 4; return bx === by;`. The magic `4` and the isotropy rule are CSS-expressibility knowledge the charter assigns to `filters-css`. The base leaves already delegate (they call `computeBlurFilterCss` and read a `null` return as "no CSS equivalent"); the predicate should ask `filters-css` the same way, not re-encode the default here.
- **Sentinels:** the unknown-kind `default: return false` (`:99-101`) is correct sentinel use.

### 7. Tests & honesty — PARTIAL

- **`index.ts` export order is wrong** (`b2824e3d8:packages/filters-canvas/src/index.ts:2-4`): the new `export { applyCanvasFilter, … }` line sits _after_ `applyDropShadowFilterToCanvas`, but `applyCanvasFilter` sorts _before_ it. Correct order is Blur → Canvas → DropShadow → OuterGlow. Fails `npm run order:check`.
- **Tests colocated; the two `describe` blocks (`applyCanvasFilter`, `canUseCanvasFilterCssFor`) are alphabetized and mirror the two exports.** Good.
- **Honest pass-through.** The 10 "canvas cannot render natively" arms (`:86-97`) draw `source` directly with JSDoc documenting "degraded pass-through." Honest _given no `filters-surface` dependency_ — but it returns `true` ("handled"), signalling the filter was applied when it was a no-op. Whether that is the right signal is an open question, not a delta defect (base could do no better).
- **`testHelper.ts` not packaged.** `package.json` `files` ships `src/**/*.test.ts` only; `testHelper.ts` is not a `.test.ts`, so the colocated test importing it would not resolve from a published tarball. Minor (tests aren't run from the tarball) — noted.

## Score rationale

58/100 — **partial**. The two new functions are reasonably named and tested, and the dispatch shape is sound in outline. But the delta (a) **does not build** in the integrated tree (B1 — the `filters-css` `svgFilterUrl` dependency is missing/merge-conflicted), (b) duplicates three existing leaves instead of composing them, (c) ships a wrong export order that fails `order:check`, and (d) re-homes CSS-expressibility knowledge the charter assigns to `filters-css`. None is a redesign; all are correctable. Not yet the final shape worth merging as-is.

## Candidate Open directions (routed to assessment → charter)

- Fork B for the 14-arm dispatcher switch (charter Open #6/#7 already open).
- Whether `applyCanvasFilter` returning `true` for a no-op pass-through is the right caller signal, or whether it should return `false`/tri-state so a caller can fall to another backend.
- The cross-package `filters-css` `svgFilterUrl` materialization is the unblock for the `ColorMatrixFilter` arm; coordinate at the family level.
