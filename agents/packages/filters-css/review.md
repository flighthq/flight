---
package: '@flighthq/filters-css'
status: partial
score: 30
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch
  - source
  - charter.md
---

# Review: @flighthq/filters-css

Merge-gate review of the **integration delta only** — `incoming/integration-b2824e3d8/head/packages/filters-css/` against the approved baseline `incoming/integration-b2824e3d8/base/packages/filters-css/` (`origin/main`, `eb73c3d74`). Findings reference `b2824e3d8:<path>`. The baseline is the blessed floor and is not critiqued. This review supersedes the score-84 survey that was written against the `builder-67dc46d64` bundle: **that work did not land in this integration branch** — the integration head contains only the broken index edit described below, not the 14-emitter SVG backend that review described.

## Verdict

`reject` — 30/100. The integration delta is a **single source change** (`index.ts`) and it is broken: it re-exports eight symbols from `./svgFilterUrl`, a module that does not exist anywhere in the package tree. The package will not typecheck or build. This is a dangling re-export with no implementation, no test, and no backing file — a blocking merge failure, not a stylistic objection.

## The delta, in full

Base and head differ in exactly one file. Every other source, test, and config file is byte-identical between `base` and `head` (verified by `diff -q` across all eight files). The base `index.ts` is a clean 3-line barrel:

```ts
export { computeBlurFilterCss } from './cssBlurFilter';
export { computeDropShadowFilterCss, getShadowFilterOffset } from './cssDropShadowFilter';
export { computeOuterGlowFilterCss } from './cssOuterGlowFilter';
```

The head `index.ts` (`b2824e3d8:packages/filters-css/src/index.ts`) appends:

```ts
export {
  createSvgFilterDataUri,
  svgFeColorMatrix,
  svgFeComposite,
  svgFeConvolveMatrix,
  svgFeFlood,
  svgFeGaussianBlur,
  svgFeMerge,
  svgFeOffset,
} from './svgFilterUrl';
```

There is no `svgFilterUrl.ts` in `b2824e3d8:packages/filters-css/src/`. The head `src/` directory contains exactly: `cssBlurFilter.ts`, `cssDropShadowFilter.ts`, `cssOuterGlowFilter.ts`, their three `.test.ts` files, and `index.ts`. A grep across the entire head package for `svgFilterUrl`, `createSvgFilterDataUri`, or `svgFeColorMatrix` matches **only** `index.ts` itself. None of the eight re-exported symbols is implemented, declared, or tested anywhere in the package.

This is the integration branch picking up the index.ts from a more advanced builder snapshot without bringing the implementation files alongside it — a half-merged change. The result is strictly worse than the approved base, which compiled.

## Harsh-standard scorecard (delta only)

1. **Composition / bedrock — FAIL.** The delta claims an entire SVG-`fe*` primitive vocabulary (`createSvgFilterDataUri` + seven `fe*` builders) but ships zero of it. There is no unit to judge for decomposition — there is an export manifest pointing at a void (`b2824e3d8:packages/filters-css/src/index.ts`:4-13). A claimed composition with no parts is the worst form of the decomposition smell: the surface exists, the bedrock under it does not.

2. **Naming clarity — unverifiable on the delta.** The eight names (`createSvgFilterDataUri`, `svgFe*`) read reasonably on their face (`create*` allocates; `svgFe*` borrows SVG's own element names, which is honest, not Flight-type abbreviation). But a name with no implementation is unverifiable — the signatures, out-param posture, and `Readonly<>` usage all live in a file that is not here. No pass can be granted for surface that does not exist.

3. **Tree-shaking / bundle invariant — FAIL (it does not build).** `package.json` correctly declares `"sideEffects": false` and a single root `.` export (unchanged from base, `b2824e3d8:packages/filters-css/package.json`), and `index.ts` is a thin barrel with no top-level side effects — so the _shape_ is right. But the invariant is moot: `tsc -b` (`include: ["src"]`, `rootDir: src`, `b2824e3d8:packages/filters-css/tsconfig.json`) will fail to resolve `./svgFilterUrl`, so nothing tree-shakes because nothing compiles. A barrel that re-exports a missing module is a hard build error, not a bundle-size question.

4. **Registry vs closed union (fork B) — not exercised by the delta.** No dispatch code is added or changed. The base emitters (`computeBlurFilterCss`, `computeDropShadowFilterCss`, `computeOuterGlowFilterCss`) are individual functions, not a `switch`; the closed-`switch`/registry question that the prior 84 review raised concerned an aggregator (`computeBitmapFilterCss`) that **is not present in this integration head at all**. Nothing to flag in the delta.

5. **Subject triad + plurality guard — PASS (unchanged).** `filters-css` is a correctly-homed `<subject>-<backend>` leaf and the delta does not disturb that. No format/backend mis-homing is introduced.

6. **Contract hygiene — FAIL.** The delta breaks the most basic contract obligation: **it must compile.** Beyond that, the re-exported surface cannot be checked for types-first sourcing, `out`-param alias-safety, sentinel-vs-throw, or `Readonly<>` because the file is absent. The `crate: null` posture (Canvas/DOM host-web-only substrate) remains correct in the charter and CONTRACT — no Rust mirror is expected — so that axis is fine; everything else on this axis is unverifiable-by-absence, which for a merge gate is a fail.

7. **Tests & honesty — FAIL.** The three existing tests (`cssBlurFilter.test.ts`, `cssDropShadowFilter.test.ts`, `cssOuterGlowFilter.test.ts`) import only base symbols and still pass — but they cover none of the eight new exports. The delta adds **eight unexported-but-also-unimplemented** names: dead surface in the most literal sense. `exports:check` (every export needs a colocated test) and `tsc -b` would both reject this head. The claim embedded in the export list — "this package emits SVG filter data-URIs" — does not match the code, which emits nothing of the sort. This is the exact "claims must match code / no dead exports" failure the standard names.

## What is approvable

Nothing in the delta. The _base_ package (blur / drop-shadow / outer-glow, sentinel `null` for anisotropic/knockout, shared `rgbaFromInt` color packing, clean barrel) is the approved floor and is sound — but that is the baseline, not the incoming change. The only correct merge outcome for this delta is to reject it and either (a) revert `index.ts` to the base 3-export form, or (b) bring the actual `svgFilterUrl.ts` implementation (and its colocated `svgFilterUrl.test.ts`) into the head so the eight exports resolve.

## Required before this can merge

1. **Restore buildability.** Either delete the `./svgFilterUrl` re-export block from `b2824e3d8:packages/filters-css/src/index.ts` (reverting to the base barrel), **or** add `src/svgFilterUrl.ts` implementing all eight named exports plus a colocated `src/svgFilterUrl.test.ts`. A half-state — exports without the file — must not land.
2. **If the SVG path is intended to land here,** it must arrive as a coherent unit: implementation + tests + the descriptor coverage that the score-84 builder review documented (color-matrix, inner-shadow/glow, bevel, convolution, sharpen, aggregator). Pulling in only the barrel line from that work is the failure mode that produced this.
3. **Run `npm run exports:check` and `tsc -b`** on the integration head before re-submitting; both currently fail on this package.

## Charter & docs fit

The charter (`charter.md`) is an explicit DRAFT/stub — `North star`, `Boundaries`, and `Decisions` carry no blessed rulings, so there is no blessed principle for the delta to contradict. Its "What it is" describes the _intended_ full CSS/SVG emitter tier (the builder work), which makes the gap between charter ambition and this integration head's reality stark: the charter describes the `svgFilterUrl` infrastructure as present; the integration head does not contain it. The charter's many Open directions (fork B registry, `getShadowFilterOffset` collision, anisotropy via SVG, aggregation ownership) are all downstream of an SVG/aggregator layer that is **not in this head** — none are actionable until the implementation actually lands here. Re-baselined: `base=origin/main(eb73c3d74)`, `evidence=integration-b2824e3d8 delta`.
