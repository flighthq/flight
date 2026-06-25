---
package: '@flighthq/scene-gl'
updated: 2026-06-24
by: ingest:builder-67dc46d64
---

# scene-gl — Status Log

> Append-only continuity log, newest on top. Entries distributed from worker reports on ingest are **as-claimed** until a review pass verifies them against the diff.

## 2026-06-25 — builder Phase 3 (Recommended sweep)

Swept the assessment's two `## Recommended` items. **Both parked; no source edits made.** Package own-tests still green (37 files, 192 tests).

**Parked:**

- **Capture the `mesh-blend-transparency` baseline.** Cross-boundary: the artifact lives under `tests/functional/mesh-blend-transparency/` (outside `packages/scene-gl/`), and committing a baseline requires running the visual-capture loop — neither is a within-package source edit this sweep may perform.
- **Wire `hasGlMeshGeometryUv1` into standard-PBR `bind()` (gap 8).** The item's factual premise does not match the current code: there is no `hasGlMeshGeometryUv1` helper anywhere in `packages/scene-gl/src/` (the only `uv1` reference is the `ATTRIBUTE_LOCATION` entry in `glMeshUpload.ts`), `buildGlPbrStandardDefineKey` has no `hasUv1` parameter, `GlPbrDefineKey` has no `hasUv1`/UV1 field, and the PBR shader source has no `HAS_UV1` path or `a_uv1` input. Genuinely closing this gap would require (a) adding a `hasUv1` flag to `GlPbrDefineKey` plus a `HAS_UV1` shader branch, (b) authoring the missing `hasGlMeshGeometryUv1` predicate, and (c) making the geometry available at program-selection time — but the `GlMeshMaterialRenderer.bind(state, material, lights, camera)` contract in `@flighthq/types` does not receive geometry (only `draw()` does). That is a cross-boundary contract change to `@flighthq/types` plus a design decision about where program selection happens, so it is not a sweep-safe within-package edit. Recommend the assessment be re-derived from the current source before this is reattempted.

# Status: @flighthq/scene-gl

**Session dates:** 2026-06-24 (pass 1), 2026-06-24 (pass 2) **Starting score (pass 1):** 62/100 **Pass-1 estimated score:** 68/100 **Pass-2 estimated score:** 73/100

## Implemented APIs (cumulative, both passes)

### drawGlScene.ts — two-pass transparency sort (Bronze, pass 1)

`drawGlScene` implements a two-pass draw loop:

- **Pass 1 (opaque):** Subsets whose material `alphaMode` is `'opaque'` or `'mask'` draw in scene-graph order with no GL blending (depth-write on, set by `beginGlMeshDraw`).
- **Pass 2 (blended):** Subsets whose material `alphaMode` is `'blend'` sort back-to-front by the mesh origin's clip-space W (computed from the view-projection column-vector dot with the world translation), then draw with `gl.enable(BLEND) / blendFunc(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)`. Blending is disabled after the pass.

### drawGlScene.ts — pool isolation: per-state draw-entry pools (pass 2)

Previously, `drawGlScene` used **module-level** `opaquePool`, `blendedPool`, `opaqueDrawList`, and `blendedDrawList`. These four arrays are now owned by `GlSceneRuntime`, one set per render state. This removes the implicit cross-state sharing that would have been an issue if two `GlRenderState` objects ever called `drawGlScene` in the same tick.

Changes:

- `GlSceneRuntime` gains four new fields: `blendedDrawList`, `blendedPool`, `opaqueDrawList`, `opaquePool`.
- `drawGlScene` reads these from `getGlSceneRuntime(state)` instead of module-level variables.
- Pool helpers `acquireOpaqueEntry`/`acquireBlendedEntry` now take the pool array as a parameter rather than closing over module-level state.
- Module-level pool constants removed entirely.

New test in `glSceneRuntime.test.ts`:

- `gives each render state its own draw-entry pools, not shared singletons` — verifies that two independently-created states have distinct pool/list arrays.

### glSceneRuntime.ts — `GlSceneDrawEntry` interface exported (pass 2)

`GlSceneDrawEntry` is a new exported interface whose fields are typed as `object` (so the header's runtime type stays free of scene-gl-internal types like `GlMeshMaterialRenderer` or `MeshGeometry`). It is the type of the per-subset draw records pooled on `GlSceneRuntime`. Scene-internal callers cast it to the private `DrawEntry` alias for type-safe field access; external code or future host packages (e.g. a custom draw loop) can reference the pool without importing internal types.

### glMeshUpload.ts — `uv1`, `joints0`, `weights0` attribute locations (Bronze, pass 1)

`ATTRIBUTE_LOCATION` includes:

- `uv1: 5` — second UV set (glTF TEXCOORD_1); used by the PBR shader's `HAS_UV1` path.
- `joints0: 6` and `weights0: 7` — skinning channels, reserved for a future GPU-skinning pass.

### glMeshUpload.ts — `hasGlMeshGeometryUv1` helper (pass 2)

New exported function:

```ts
function hasGlMeshGeometryUv1(geometry: Readonly<MeshGeometry>): boolean;
```

Inspects `geometry.layout.attributes` for a `'uv1'` semantic and returns `true` if found. This closes the caller-awareness gap: a material renderer's `bind()` can pass `hasGlMeshGeometryUv1(geometry)` to `buildGlPbrStandardDefineKey` as the `hasUv1` argument so the compiled shader variant matches the actual geometry layout without the caller needing to introspect the layout directly.

Without this helper, a caller needed to know to check `geometry.layout` for `uv1` before calling `buildGlPbrStandardDefineKey(..., true)` — an invisible coupling. With it, the check is a single call at the natural integration point.

Three new tests in `glMeshUpload.test.ts` (in `describe('hasGlMeshGeometryUv1')`):

- `returns false for geometry without a uv1 semantic`
- `returns true when the geometry layout carries a uv1 semantic`
- `returns false for geometry with only standard PBR attributes but no uv1`

### glPbrPrelude.ts — `hasUv1` define key flag + HAS_UV1 shader path (Bronze, pass 1)

`GlPbrDefineKey` gains a `hasUv1: boolean` flag. When true:

- `buildGlPbrDefineKey` appends `'2'` in the standard-flag block (position 6, after emissive map). Format is `'-------:-------'` (15 chars).
- `buildGlPbrDefineSource` emits `#define HAS_UV1`.
- The PBR vertex shader conditionally declares `layout(location = 5) in vec2 a_uv1` and passes `v_uv1` to the fragment stage.
- The PBR fragment shader conditionally declares `v_uv1` and routes the `u_occlusionMap` sample through `v_uv1` (canonical glTF placement for AO on TEXCOORD_1) when `HAS_UV1` is defined.

### glPbrProgramCache.test.ts — `hasUv1: false` in `makeKey` factory (pass 2 fix)

The first-pass `makeKey` helper in `glPbrProgramCache.test.ts` was missing `hasUv1`. TypeScript caught this as a type error after the field was added to `GlPbrDefineKey`. Fixed by adding `hasUv1: false` to the factory object.

### glPbrStandardBlock.ts — `hasUv1` parameter on `buildGlPbrStandardDefineKey` (Bronze, pass 1)

`buildGlPbrStandardDefineKey(standard, alphaMaskEnabled, hasUv1 = false)` gains an optional third parameter. Defaults to `false` for backward compatibility. Pass `hasGlMeshGeometryUv1(geometry)` to auto-derive from geometry layout.

### glSceneTestHelper.ts — blend state constants and `blendFunc` stub (pass 1)

`makeFakeGl2` includes `BLEND`, `SRC_ALPHA`, `ONE_MINUS_SRC_ALPHA`, and `blendFunc`.

### tests/functional/mesh-blend-transparency — transparency sort functional test (pass 2)

New functional test (`tests/functional/mesh-blend-transparency/`) exercising the two-pass transparency sort at the full WebGL render level:

**Scene:**

- Far opaque red box at `z=-2`, left-of-center.
- Semi-transparent blended blue box (`alphaMode: 'blend'`, alpha ~0.8) at `z=-1`, left-of-center, overlapping the red box.
- Near opaque green box at `z=-1`, right-of-center (no overlap with blended box).
- Blended box is added to the scene graph **first** — proving the draw order is driven by the pass, not scene insertion order.

**Assertions (`assertRender`):**

1. Near opaque green box reads as green (opaque pass working; depth-write on).
2. Overlap region reads with a blue tint AND a red component (blended box composited over opaque red box — blend pass working correctly).
3. Frame corners are background.

**Renderers:** WebGL only (`render.webgl.ts`). The transparency sort is GL-specific; `scene-wgpu` does not yet have a corresponding blended pass.

**Baseline:** Not yet captured (headless render requires the `functional-test` skill's capture workflow). The test is registered and discoverable by the functional harness — the capture step is the next action.

## Deferred items and why

### Screenshot baseline capture for mesh-blend-transparency (pass 2, immediate next step)

The functional test is authored and assertRender is implemented, but the baseline fingerprint has not been captured. Running `npm run test:functional:regression:baseline` (or the visual-capture skill) on this test will write `tests/functional/baselines/mesh-blend-transparency.json` and lock in the transparency sort behavior under screenshot regression. **Not blocked on any design decision** — just needs the capture run on hardware with a real WebGL2 context.

### Multi-light forward path (Bronze #1) — cross-package design decision

The single highest-leverage gap. `SceneLights`/`SceneLightBlock`/`packSceneLightBlock` carry at most one directional + one ambient. Extending to N point + spot + directional lights requires:

- `@flighthq/types`: replace `SceneLights` with arrays, grow `SceneLightBlock` data layout, add `MAX_FORWARD_LIGHTS`, update `GlMeshMaterialRenderer`/`WgpuMeshMaterialRenderer` comments.
- `@flighthq/render`: rewrite `packSceneLightBlock` and `LIGHT_BLOCK_FLOATS`.
- `@flighthq/scene-gl`: rewrite `GL_MESH_LIGHT_BLOCK_GLSL`, `GlLitProgram`, `resolveGlLitLocations`, and `bindGlMeshLightBlock`.
- `@flighthq/scene-wgpu`: mirror the same shader and upload changes.

This must be a coordinated change with the wgpu sibling and the Rust `flighthq-types` layout. **Do not land in scene-gl unilaterally.** Raise as a dedicated cross-backend session.

### Hemisphere light (Bronze #4) — cross-package, blocked by multi-light

`HemisphereLight` is already defined in `@flighthq/types` and `@flighthq/lighting`, but consuming it in the shader requires `SceneLights` to carry it. Blocked on the multi-light `SceneLights` redesign.

### IBL / environment (Silver) — cross-package, new resource types

Requires `EnvironmentResources` in `@flighthq/types`, `CubeTexture` GPU upload in `@flighthq/render-gl`, bake functions in scene-gl, and wgpu mirror. Medium-large effort; do after multi-light.

### Shadow mapping (Silver) — large, cross-package

Requires shadow descriptor types in `@flighthq/types`, depth pre-pass and render-target pooling in `@flighthq/render`, and shader-side PCF in scene-gl. Coordinate with scene-wgpu up front.

### GPU skinning / morph targets / instancing (Silver) — cross-package vertex semantics

`joints0`/`weights0` attribute locations are wired in `ATTRIBUTE_LOCATION` (groundwork laid), but the shader defines (`SKINNED`), joint-palette UBO, and per-family vertex prelude changes are not yet implemented. Coordinate vertex semantic names with `@flighthq/mesh`.

### `hasUv1` → geometry-driven define key wiring in material bind (near-term, low-effort)

`hasGlMeshGeometryUv1` is now available, but the standard PBR material renderer's `bind()` call in `standardPbrGlMeshMaterialRenderer.ts` still passes `buildGlPbrStandardDefineKey(pbr, ..., /* hasUv1 = false */)`. The geometry is not available in `bind()` (it is available in `draw()`), so the cleanest path is to pass it from the draw proxy or as a per-subset entry field. This is a small Silver-tier cleanup — the current behavior is safe (an unbound attribute reads zero in GL), just not optimal for assets with a `uv1` attribute that should drive AO from TEXCOORD_1.

**Design options:**

- Pass `hasUv1` as a per-subset hint stored on the `DrawEntry` before `bind()` is called (set during partition in `drawGlScene`).
- Move the define-key build to a joint `bind(state, material, lights, camera, geometry)` — a break to `GlMeshMaterialRenderer`'s interface, which would need cross-backend coordination.
- Document as caller responsibility (current state): callers that know the geometry has `uv1` pass `hasUv1 = true` explicitly to `buildGlPbrStandardDefineKey`.

### Clustered lighting, area lights, advanced shadows, OIT, UBO refactor (Gold)

All Gold-tier items are large architectural moves. Schedule after Silver baselines exist.

### Render-test / conformance baselines (Gold)

Functional test scenes per lighting/shadow/IBL/skinning feature with committed screenshot baselines. Partially unblocked by the mesh-blend-transparency test (capture step pending); the remaining baselines are blocked on multi-light and IBL work above.

## Design choices made

### Draw-entry pool location: per-state runtime, not module-level singletons

**Choice:** Pools live on `GlSceneRuntime`, allocated lazily per render state.

**Rationale:** JavaScript is single-threaded, so two render states concurrently calling `drawGlScene` cannot literally race. However, module-level mutable singletons shared across states are a subtle architectural anti-pattern — the ownership is invisible, the pool's contents are meaningless after each frame, and any future multi-state test infrastructure (or a `drawGlScene` wrapper that saves/restores the list) would hit a silent sharing bug. Putting the pools on the runtime makes ownership explicit, matches the existing `uploadCache`/`programCache` pattern, and costs nothing (two empty arrays per state).

### `GlSceneDrawEntry` field types: `object` in the header, typed alias inside the module

**Choice:** `GlSceneDrawEntry` exports fields as `object` so the interface stays import-free (no `GlMeshMaterialRenderer`, `MeshGeometry`, etc. in the runtime header). The scene-gl implementation casts `GlSceneDrawEntry` to a private `DrawEntry` interface with the real types before accessing fields.

**Rationale:** The runtime header (`GlSceneRuntime`) must be importable by anything that calls `getGlSceneRuntime`, including test helpers that do not pull in the full draw-path dependency tree. Using `object` fields avoids importing scene-gl-internal types in the header and keeps the header's surface minimal.

### `hasGlMeshGeometryUv1` placement: in `glMeshUpload.ts`, not a new file

**Choice:** Placed in `glMeshUpload.ts` because it is the natural home for geometry layout inspection alongside `ensureGlMeshUpload` and `ATTRIBUTE_LOCATION`. The three concepts — what attributes are in the layout, how they are uploaded, and whether a specific semantic is present — belong together.

### Functional test backend: WebGL only (no wgpu column)

**Choice:** `mesh-blend-transparency` registers only `render.webgl.ts`. `scene-wgpu` does not yet implement a blended pass (`drawWgpuScene` has a single-pass unsorted loop), so adding a wgpu column would either test the wrong behavior or require `scene-wgpu` changes outside this session's scope.

**Standing parity risk:** `scene-wgpu` needs the equivalent transparency sort. Surface as a suggestion for the next `scene-wgpu` session.

## Concerns and notes

1. **`proxy.normalMatrix` is still `Matrix3`, not `Matrix4`.** The proxy interface uses a scratch `Matrix3` for the normal matrix passed to draw, computed from the mesh's world `Matrix4` via `setMatrix3NormalFromMatrix4`. This is correct and cheap. Note for a future UBO refactor: the normal matrix is the only per-draw non-square matrix; a std140 layout for per-object data would need padding.

2. **`hasUv1` in `GlPbrDefineKey` is a material-time flag, but `uv1` presence is geometry-time.** See the deferred item above. The current behavior is safe (GL reads zero for an unbound attribute) but the define key and the bound attributes can disagree. `hasGlMeshGeometryUv1` is now available to close this gap, but it requires a small interface change to pass geometry into `bind()`, which is a cross-backend coordination step.

3. **`scene-wgpu` is a standing mirror concern.** The `uv1` attribute location (5), the `HAS_UV1` define path, and the transparency sort are all absent from `scene-wgpu`. None of these are regressions (scene-wgpu had neither before), but they confirm that every scene-gl feature lands on the parity gap list for scene-wgpu.

## Suggestions for future sessions

1. **Capture the `mesh-blend-transparency` baseline** — run `npm run test:functional:regression:baseline` or the `visual-capture` skill for `mesh-blend-transparency` on a machine with WebGL2. This closes the only open action item from this pass.

2. **Coordinate multi-light block expansion** across `types` / `render` / `scene-gl` / `scene-wgpu` / Rust `flighthq-types`. This is the single highest-leverage unblocked item. Design the std140 layout (point + spot arrays, `MAX_FORWARD_LIGHTS = 8` as a starting bound) once in types, then implement everywhere. Unlocks hemisphere light, point lights, spot lights, and attenuated falloff in all lit families at once.

3. **Wire `hasGlMeshGeometryUv1` into `standardPbrGlMeshMaterialRenderer.bind()`** — either by adding a geometry hint to the `DrawEntry` (set at partition time in `drawGlScene`), or by accepting geometry as an additional argument to `bind()` (cross-backend coordination required). The helper exists; the plumbing is the remaining step.

4. **Mirror transparency sort in `scene-wgpu`** — `drawWgpuScene` has the same one-pass unsorted draw loop. Both renderers should match so parity tests see consistent compositing.

5. **Add `mesh-blend-transparency` to the wgpu column** after `scene-wgpu` gains its blended pass.
