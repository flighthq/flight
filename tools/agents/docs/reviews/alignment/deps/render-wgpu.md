# Dependency Alignment: @flighthq/render-wgpu

**Verdict:** Clean — dependency mapping is correct, minimal, and predictable from the package's role; the only note is a test-only `@flighthq/displayobject` declared as a runtime dependency, a pattern shared with sibling `render-gl`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Low | `@flighthq/displayobject` (runtime `dependencies`) | Imported **only in test files** (`createBitmap` in `wgpuDraw.test.ts` and `wgpuShaderBinding.test.ts`); never referenced in non-test `src/`. Production code only needs the `DisplayObject` _type_, which it correctly takes from `@flighthq/types`. As a runtime dep it slightly overstates the install closure for consumers. | Move to `devDependencies`. Note: sibling `render-gl` does the identical thing, so this is a house convention, not an isolated slip — fix both together or codify it (e.g. `packages:check` treating test-only entity factories as an accepted runtime dep). Not actionable in isolation without a cross-backend decision. |
| Info | `@webgpu/types` (devDep) | Correctly placed: ambient global `GPU*` types (`GPUDevice`, `GPURenderPipeline`, `GPUBuffer`, …) used pervasively across `src/`, contributing zero runtime weight. | None. |
| Info | `@flighthq/types` edges | All 9 type imports use `import type` and resolve from the header layer; no cross-package types are redefined inline (the two `export type` lines in `index.ts`/`wgpuShader.ts` are pure re-exports of `@flighthq/types` symbols). | None. |
| Info | Layering | Depends on render core (`@flighthq/render`) and value-typed leaves (`geometry`, `surface`), never on another render backend (`render-gl`/`render-webgl`/`render-canvas`/`render-dom`) and never on `@flighthq/sdk`. No "up the layer" reaches. Mapping reads exactly as the package purpose predicts. | None. |

## Declared vs used

`npm run packages:check` passes (86 packages valid); the items below are judgment beyond it.

**Unused in production source (candidate for devDependencies):**

- `@flighthq/displayobject` — used only by `*.test.ts` (`createBitmap`). The `DisplayObject` type used in production comes from `@flighthq/types`, not this package.

**Phantom (used-but-undeclared):** none. All non-test value imports map to a declared dependency:

- `@flighthq/geometry` — `createMatrix`, `copyMatrix` (`wgpuRenderState.ts`, `wgpuRenderTarget.ts`)
- `@flighthq/render` — `createRenderState`, `createRenderStateRuntime`, `setRenderStateBackgroundColor`, `getOrCreateRenderProxy2D`
- `@flighthq/surface` — `createSurface` (`wgpuSurface.ts`)
- `@flighthq/types` — value kinds/enums (`BlendMode`, `ColorTransformMaterialKind`, `UniformColorTransformMaterialKind`, `DefaultMaterialKind`, `EntityRuntimeKey`) plus all type imports

**Other checks:**

- No `@flighthq/sdk` (barrel) import.
- No cross-backend renderer import.
- All workspace deps pinned `"*"`.
- `"sideEffects": false`; single `.` export; tree-shakable.
