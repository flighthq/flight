---
package: '@flighthq/render-gl'
status: solid
score: 84
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch (packages/render-gl slice)
  - head/packages/render-gl/src (source + tests)
  - prior review.md (builder-67dc46d64, as-claimed)
  - charter.md
---

# render-gl — Merge Review (integration-b2824e3d8 vs approved origin/main)

This review judges **only the delta** — `incoming/integration-b2824e3d8/head/packages/render-gl/` against the approved baseline `incoming/integration-b2824e3d8/base/packages/render-gl/` (`origin/main`, `eb73c3d74`) — as a merge gate. The approved base is the blessed floor and is not under review. Prior score/status carry over from the standing review; this front matter reflects the gate's read of the merged artifact, knocked one point below the standing 86 by the one non-compiling test file the delta introduces.

## What the delta is

The render-gl change in `b2824e3d8` is **test-only**. No source file, `package.json`, `tsconfig.json`, or `vitest.config.ts` differs from base (verified byte-for-byte). The four touched files are exactly the test-coverage sweep the charter blesses (charter Open directions, "Test-coverage gaps (pre-existing)"):

- `b2824e3d8:packages/render-gl/src/glRenderTargetPool.test.ts` (**new**) — covers `acquireGlRenderTarget`, `createGlRenderTargetPool`, `destroyGlRenderTargetPool`, `releaseGlRenderTarget`.
- `b2824e3d8:packages/render-gl/src/glRenderTarget.test.ts` (extended) — adds a `resolveGlRenderTarget` describe block.
- `b2824e3d8:packages/render-gl/src/glShaderBinding.test.ts` (extended) — adds `getGlMaterialShader` / `registerGlMaterialShader` describe blocks.
- `b2824e3d8:packages/render-gl/src/glFullscreenPass.test.ts` (**new**) — covers `clearGlRenderTarget`, `compileGlFullscreenProgram`, `drawGlFullscreenPass` — **and a fourth describe block, `tryCompileGlFullscreenProgram`, that tests a function the merged source does not contain.**

Three of the four files are clean, well-grounded coverage of real exports. The fourth does not compile.

## Verdict

**REVISE — one blocking defect, otherwise mergeable.** The delta is the right _kind_ of work (within-package test coverage, named as appropriate in the charter), and three files are honest and accurate. But the new `glFullscreenPass.test.ts` imports two symbols that **do not exist anywhere in the integration head**, so the file fails to typecheck and the delta cannot pass `npm run check` / `npm run ci`. This is a merge gate; a non-compiling test file is a hard blocker regardless of pre-release latitude.

## Blocking defect — `glFullscreenPass.test.ts` references absent source

`b2824e3d8:packages/render-gl/src/glFullscreenPass.test.ts:4-11`:

```ts
import {
  clearGlRenderTarget,
  compileGlFullscreenProgram,
  drawGlFullscreenPass,
  tryCompileGlFullscreenProgram,
} from './glFullscreenPass';
import { getGlRenderStateRuntime } from './glRenderState';
import { getGlLastShaderLog } from './glShader';
```

- `tryCompileGlFullscreenProgram` is **not exported by `glFullscreenPass.ts`**. The merged source exports only `clearGlRenderTarget`, `compileGlFullscreenProgram`, `drawGlFullscreenPass` (verified in both base and head — the delta did not add the source). The test's entire `describe('tryCompileGlFullscreenProgram', …)` block (`:193-242`, seven `it`s asserting a _non-throwing_ compile, link-failure `null`, and shader-log capture) exercises an API that is not present.
- `getGlLastShaderLog` is **not exported by `glShader.ts`** — nor anywhere in the package. `glShader.ts` _throws_ on compile/link failure (`throw new Error('Shader compile error: …')`, `glShader.ts:36`) and keeps no last-log slot. The four `it`s that call `getGlLastShaderLog` (`:222-241`) assert behavior that has no implementation.

`tsc -b` typechecks `src/*.test.ts`, so both imports resolve to TS2305 "no exported member" and the file fails to compile. The clean three files would pass; this one would fail the gate.

### Provenance — this is a delta defect, not a base critique

The prior standing `review.md` (which surveys the **builder-67dc46d64** worktree, a _different_ unmerged branch) explicitly records these functions as present _there_: "Non-throwing shader compile (`glShader.ts`) — `tryCompileGlBitmapProgram` + `getGlLastShaderLog` … `tryCompileGlFullscreenProgram` mirrors it in `glFullscreenPass.ts`." The integration head dropped that source surface (neither base nor head contains it — verified by exhaustive grep), but the **test written against it landed anyway**. The base has no `glFullscreenPass.test.ts` at all, so this file is wholly introduced by the delta. The defect is a classic botched-merge casualty: the test for an in-flight non-throwing-shader feature was merged without the source it depends on. It is squarely attributable to the incoming change.

## Clean files — pass on every standard

The other three files are correct and honest, and close real coverage gaps the charter named:

- **`glRenderTargetPool.test.ts`** — imports only the four real exports; describe blocks alphabetized and mirroring exports (`acquireGlRenderTarget`, `createGlRenderTargetPool`, `destroyGlRenderTargetPool`, `releaseGlRenderTarget`). Claims match source: the "reuses a matching released target" and "ceiled, clamped dimensions" cases (`:18-58`) accurately exercise `acquireGlRenderTarget`'s `Math.max(1, Math.ceil(...))` match logic (`glRenderTargetPool.ts:14-31`), and `destroyGlRenderTargetPool` is asserted to `deleteFramebuffer` each parked target and empty `free` (matches `glRenderTargetPool.ts:38-41`). `release*` is correctly asserted _not_ to destroy (pool-bracket semantics intact).
- **`glRenderTarget.test.ts` `resolveGlRenderTarget` block** — accurately matches source: no-op when `sampleCount <= 1` or `resolveFramebuffer === null` (`glRenderTarget.ts:207`), and a per-color-attachment blit + single `flush` for an MSAA target with two textures (`:213-234`). The "two attachments → two blits, two readBuffer, one flush" assertion is exactly the source's loop-then-flush shape. Honest.
- **`glShaderBinding.test.ts` material-shader blocks** — `getGlMaterialShader` returns `null` when unregistered and the registered shader otherwise; `registerGlMaterialShader` is last-write-wins and per-state isolated; `resolveGlShader` returns the material-kind shader for a matching node. All match `glShaderBinding.ts:14-49` (the `materialBitmapShaderMap?.get(kind) ?? null` lookup and the `??= new Map()` registry). Uses the string-kind model correctly (`'Tint' as Kind`).

## Standards scorecard (delta only)

1. **Composition / bedrock** — n/a to a test-only delta; no new abstraction or fused subject. Pass.
2. **Naming clarity** — no new exports introduced; the tested names all carry the `Gl` prefix + full type word. The _absent_ `tryCompileGlFullscreenProgram` / `getGlLastShaderLog` are well-named — the problem is they don't exist, not that they read badly. Pass on naming, fail on existence (folded into Tests & honesty).
3. **Tree-shaking / bundle invariant** — `package.json` unchanged, still `"sideEffects": false`; `index.ts` identical to base; no new dependency, no eager registration. Pass.
4. **Registry vs closed union** — `registerGlMaterialShader`/`getGlMaterialShader` are an open per-kind registry (`Map<Kind, …>`), and the new test exercises it as one (overwrite, per-state isolation). Aligned with fork B. Pass.
5. **Subject triad + plurality** — n/a; no format/backend code moved. Pass.
6. **Contract hygiene** — types-first holds (`GlRenderTarget`, `Kind` imported from `@flighthq/types`); `resolveGlRenderTarget` is asserted alias-clean against the runtime; pool `acquire/release` brackets tested. The one `makeTarget` literal in the (broken) fullscreen test builds a plain `GlRenderTarget` descriptor with fake `{} as WebGLFramebuffer` handles — acceptable as a structural fixture, low priority, and moot until the file compiles. Pass.
7. **Tests & honesty** — **FAIL.** `glFullscreenPass.test.ts` claims do not match code and the file does not compile (the blocking defect above). The other three files pass this standard cleanly.

## Note on standing-review drift

The standing `review.md`/`assessment.md`/`status.md` in the bundle describe the richer **builder-67dc46d64** surface (instrumentation, texture/pipeline primitives, the non-throwing shader family). The integration head gated here is the approved-base source plus four test files only — it does **not** contain that builder work. This is the same status/charter-vs-merged-artifact drift seen across the integration bundle; flag it so the continuity log matches what actually merges, and so the absent `tryCompile*`/`getGlLastShaderLog` source is not assumed present by a later pass.
