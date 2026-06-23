# Dependency Alignment: @flighthq/effects-wgpu

**Verdict:** Clean layering and import hygiene; one stale phantom dependency (`@flighthq/filters`) declared in both `package.json` and `tsconfig.json` references but never imported.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Medium | `@flighthq/filters` | Declared dependency is never imported in `src/`. The filter-pipeline symbols this package uses (`createWgpuFilterPipeline`, `drawWgpuFilterPass`, `WgpuFilterPipeline`, etc.) all come from `@flighthq/filters-wgpu`, never from `@flighthq/filters`. `filters` is already a transitive dep of `filters-wgpu`, so the direct edge buys nothing. `packages:check` passes, so it does not catch this — judgment flag. | Remove `"@flighthq/filters": "*"` from `dependencies` and drop `{ "path": "../filters" }` from `tsconfig.json` references. |
| Info | `@webgpu/types` (`GPUTexture`) | `GPUTexture` is referenced in `wgpuMotionBlurEffect.ts` and `wgpuRenderEffectPipeline.ts` but `@webgpu/types` is not a local devDependency. This type-checks because `tsconfig.base.json` declares `@webgpu/types` in its global `types` array, which is the established monorepo pattern. Not a defect; noted only because sibling `filters-wgpu` redundantly re-declares it locally — the inconsistency is in the sibling, not here. | No action. (Optionally normalize the monorepo so wgpu packages either all declare it locally or all rely on the base config — out of scope for this package.) |

## Declared vs used

**Used and declared (correct):**

| Dependency | Imported symbols (representative) | Layer note |
| --- | --- | --- |
| `@flighthq/types` | type-only (`import type`), 47 sites | Header layer. All imports are `import type`; no runtime weight. Correct. |
| `@flighthq/filters-wgpu` | `drawWgpuFilterPass`, `createWgpuFilterPipeline`, `WgpuFilterPipeline`, `createWgpuDualSourcePipeline`, `drawWgpuDualSourcePass`, `WgpuDualSourcePipeline` (50 sites) | Same backend tier (wgpu filter primitives). Predictable: effects compose filter passes. |
| `@flighthq/render-wgpu` | `acquireWgpuRenderTarget`, `releaseWgpuRenderTarget`, pipeline plumbing | wgpu render core — depending "down" onto the backend core is correct. |
| `@flighthq/effects` | `computeBloomBlurRadius` | Substrate-agnostic recipe math; the `-wgpu` package implements the backend over it. Clean directional edge. |
| `@flighthq/geometry` | `createMatrix` | Value/math leaf. Expected. |

**Unused (declared, not imported):**

- `@flighthq/filters` — see Findings (Medium). Stale.

**Phantom (used, not declared):**

- None. `@webgpu/types` is used at the type level but resolves via the root `tsconfig.base.json` `types` array per monorepo convention (see Info row), so it is not a phantom runtime dependency.

**Other hygiene checks (all pass):**

- No import of `@flighthq/sdk` (the barrel).
- No inline cross-package type or interface definitions in `src/` — all cross-package types come from `@flighthq/types`.
- No mixed `import { type Foo, bar }` inline type imports; `@flighthq/types` imports are all on dedicated `import type` lines.
- All workspace deps pinned to `"*"`.
- `"sideEffects": false`; `index.ts` is a thin re-export barrel with a single `.` export entry — tree-shakable.
- Layering respected: depends down onto `render-wgpu`/`filters-wgpu` (backend cores) and onto `effects`/`geometry`/`types` (substrate-agnostic / header), never up and never sideways onto a different backend (no `filters-gl`, `render-gl`, etc.).
