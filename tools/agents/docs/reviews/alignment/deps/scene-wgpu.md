# Dependency Alignment: @flighthq/scene-wgpu

**Verdict:** Clean — dependency mapping is correct, layered, and tree-shakable; the only note is that three deps (`lighting`, `mesh`, `scene`) are test-only, a pattern shared verbatim with the `scene-gl` sibling and accepted by `packages:check`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/lighting`, `@flighthq/mesh`, `@flighthq/scene` | Imported only from `*.test.ts` files (and `wgpuSceneTestHelper.ts`, a test-only helper not exported from `index.ts`); never referenced in shipped source. Declared as runtime `dependencies`, not `devDependencies`. | Acceptable as-is: identical pattern in `scene-gl`, and `packages:check` passes. If the monorepo ever distinguishes test-only workspace deps, these three move to `devDependencies`. No action needed now. |
| None | `@flighthq/sdk` | Not imported. Correct (barrel ban respected). | — |
| None | Layering | Depends on render core (`@flighthq/render`) and its own backend core (`@flighthq/render-wgpu`); never on another backend (no `render-gl`/`render-canvas`/`render-dom`). Reaches only "down"/sideways to value crates (`geometry`, `camera`, `node`, `materials`) and the header (`types`). | — |
| None | Inline cross-package types | All ~20 exported interfaces (`WgpuMeshPipeline`, `Wgpu*DefineKey`, `Wgpu*Pipeline`, `WgpuSceneRuntime`, etc.) are WGPU-backend-private plumbing types that legitimately belong in this package, not cross-package contracts. None duplicate or shadow a `@flighthq/types` type. | — |
| None | `import type` discipline / tree-shaking | Type-only symbols use `import type`; value imports (Kind string constants from `types`, `unpackColorToLinear` from `materials`, `prepareSceneRender`/`createRenderState` from `render`, runtime helpers from `render-wgpu`) are genuine runtime uses. `"sideEffects": false` set; no top-level `register*`/side-effect statements. | — |

## Declared vs used

Workspace deps all pinned `"*"`. devDependency `typescript ^5.3.0` only.

**Used in shipped (non-test) source:** `@flighthq/camera`, `@flighthq/geometry`, `@flighthq/materials`, `@flighthq/node`, `@flighthq/render`, `@flighthq/render-wgpu`, `@flighthq/types`.

**Declared but used only in tests (test-only):** `@flighthq/lighting`, `@flighthq/mesh`, `@flighthq/scene`. Not unused (tests exercise them) but not shipped-runtime either — see Info finding above.

**Phantom (used but undeclared):** none.

**Unused (declared, never imported anywhere):** none.
