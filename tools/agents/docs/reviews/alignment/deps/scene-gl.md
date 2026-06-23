# Dependency Alignment: @flighthq/scene-gl

**Verdict:** Clean — dependency mapping is correct, layered, cycle-free, and tree-shakable; the only note is that two deps (`scene`, `lighting`) are test-only, a pattern shared verbatim with the `scene-wgpu` sibling and accepted by `packages:check`.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/scene`, `@flighthq/lighting` | Imported only from `drawGlScene.test.ts` (`createScene`/`createMesh`, `createAmbientLight`/`createDirectionalLight`); never referenced in shipped (non-test) source. Declared as runtime `dependencies`, not `devDependencies`. Harmless at runtime (`"sideEffects": false`, source never imports them, so they cannot enter a bundle), but the declared runtime surface overstates what the package actually needs. | Acceptable as-is: identical pattern in `scene-wgpu`, and `packages:check` passes (it validates `"*"` pinning and shape, not test-only vs runtime classification). If the monorepo ever distinguishes test-only workspace deps, these two move to `devDependencies`. No action needed now. |
| None | `@flighthq/sdk` | Not imported anywhere. Correct (barrel ban respected). | — |
| None | Layering / cycles | Depends on the render core (`@flighthq/render`) and its own backend core (`@flighthq/render-gl`); never on another backend (no `render-wgpu`/`render-canvas`/`render-dom`). Reaches only "down"/sideways to value crates (`geometry`, `camera`, `mesh`, `materials`, `node`, plus `scene`/`lighting` in tests) and the header (`types`). Neither `render` nor `render-gl` depends back on `scene-gl` — no cycle. Matches the documented `<subject>-<backend>` layering: scene subject over the render-gl backend core. | — |
| None | Inline cross-package types | All ~20 exported interfaces (`GlMeshProgram`, `GlLitProgram`, `GlPbrProgram`, `Gl*DefineKey`, `Gl*Program`, `GlSceneRuntime`, `GlMeshUpload`, `GlWireframeUpload`, `FakeGl2`) are GL-backend-private plumbing/runtime-state types that legitimately belong in this package, not cross-package contracts. None duplicate or shadow a `@flighthq/types` type. | — |
| None | `import type` discipline / tree-shaking | Type-only symbols use dedicated `import type` lines (113 across the package); no forbidden mixed `import { type X, y }` form. Value imports are genuine runtime uses (`DefaultMaterialKind` etc. from `types`, math from `geometry`, `getCameraViewProjectionMatrix4` from `camera`, `getNodeWorldTransformMatrix4` from `node`, `prepareSceneRender` from `render`, `bindGlTexture`/`createGlRenderStateRuntime` from `render-gl`, material helpers from `materials`/`mesh`). `"sideEffects": false` set; no top-level `register*`/side-effect statements. | — |
| None | Predictability | The dep set reads exactly as a reader would predict for a WebGL2 3D scene renderer: the GL backend core, the render core, the 3D value crates (camera/mesh/materials/geometry), the graph (node), and the header. No surprising edges. | — |

## Declared vs used

Workspace deps all pinned `"*"`. devDependency `typescript ^5.3.0` only.

**Used in shipped (non-test) source:** `@flighthq/camera`, `@flighthq/geometry`, `@flighthq/materials`, `@flighthq/mesh`, `@flighthq/node`, `@flighthq/render`, `@flighthq/render-gl`, `@flighthq/types`.

**Declared but used only in tests (test-only):** `@flighthq/scene`, `@flighthq/lighting`. Not unused (tests exercise them) but not shipped-runtime either — see Info finding above.

**Phantom (used but undeclared):** none.

**Unused (declared, never imported anywhere):** none.
