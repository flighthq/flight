# Flight Render & Scene Architecture

The render-layer and 3D-scene architecture, settled across the 2026-06-22 design sessions. This is the **target** state — a migration is in progress (a repo-wide acronym sweep, then a render-package split), so where this names packages that do not exist on disk yet (`render-gl`, `displayobject-gl`, `scene-gl`), those are the post-migration names. Read this before working the render or scene layers.

## Naming conventions (codebase-wide)

- **Acronyms are PascalCase words** — capitalize only the first letter: `Gl`, `Wgpu`, `Dom`, `Html`, `Css`, `Json`, `Id`, `Pbr`, `Aabb`, `Rgba`, `Ibl`, `Hdr`, `Uv`. In camelCase leading position they are fully lowercase: `glState`, `parseHtml`, `toRgba`. **Digits are not acronyms** — `Vector3`, `Matrix4`, `HasTransform3D`, `WebGL2` keep their digit. **External platform types keep upstream casing** — `HTMLCanvasElement`, `WebGL2RenderingContext`, `WebGLTexture`, `GPUDevice`, `DOMMatrix`, `JSON`, `URL`.
- **Backends are `gl` / `wgpu`**, not `webgl`/`webgpu`. These are the honest, portable, Rust-crate-matching names (the `wgpu` crate is native-first; `glow`/`gl` for GL). The web implementation wraps a WebGL2 / WebGPU context _internally_; the package and its public types are the portable abstraction (`GlRenderState` holds a `WebGL2RenderingContext` on web, an OpenGL context on native). 1:1 with a parallel Rust crate system.
- **No domain suffixes on public types** — no `Transform3D` (the canonical local transform is `Matrix4`), no `World*` prefix. Math arity in a primitive name _is_ identity and is fine (`Vector3`, `Quaternion`).
- **Device photo capture is `@flighthq/webcam` (`Webcam`)**; `Camera` is the 3D camera.

## Package taxonomy — the layering

```
node                                 a thing with hierarchy
displayobject  /  scene              a graph of nodes (a node FAMILY)
render                               how you render a node           (backend-agnostic core)
render-{canvas,dom,gl,wgpu}          how you render on a BACKEND      (per-backend core: state/context/targets)
displayobject-{canvas,dom,gl,wgpu}   how you render THIS family ON that backend  (2D renderers)
scene-{gl,wgpu}                      how you render THIS family ON that backend  (3D renderers)
effects / effects-{backend}          post-process pipeline (sibling cell; depends on render-{backend})
filters / filters-{backend}          filter descriptors + impls (sibling cell)
```

A renderer is the per-backend realization of a node family — its name says _what_ it renders and _on what_. The per-backend **core** (`render-gl`/`render-wgpu`: the context, render targets, texture upload, fullscreen pass, shader plumbing) is a distinct cell from the per-family **renderers** — so `scene-gl` and `displayobject-gl` (and `effects-gl`/`filters-gl`) all sit on the lean `render-gl` core without 3D pulling in 2D or vice-versa. 3D rendering is its own cell, exactly as effects/filters are — never blobbed into the 2D renderer. (Canvas/DOM have no 3D sibling, so their core-vs-renderer split is optional; `displayobject-canvas` /`displayobject-dom` may just be the renamed `render-canvas`/`render-dom`.)

## Data atoms (built, pure data — types in `@flighthq/types`)

- `@flighthq/geometry` — `Vector2/3/4`, `Matrix3/4` (+ lookAt, compose/decompose, normal-matrix), `Quaternion`, `Aabb`, `BoundingSphere`, `Frustum`, `Plane`.
- `@flighthq/mesh` — `MeshGeometry` (interleaved 48-byte canonical vertex: position3+normal3+tangent4+uv0_2; `MeshSubset` index-range partitions; branded GPU-data slots + `destroyMeshGeometry{Gl,Wgpu}Data`); builders `createBox/Sphere/Plane/Quad/Cylinder/Cone/TorusMeshGeometry`; `computeMeshGeometryNormals/ Tangents/Bounds`.
- `@flighthq/texture` — `Texture` (references an `ImageResource` + `Sampler` + `colorSpace` + uv-transform), `Sampler`, `CubeTexture`. Texture is also the universal render-graph bridge (see Stage/Texture below).
- `@flighthq/camera` — `Camera` (view `Matrix4` + `Projection` + near/far/jitter + cached inverse-view-projection), `PerspectiveProjection`/`OrthographicProjection`.
- `@flighthq/lighting` — `AmbientLight`/`DirectionalLight`/`PointLight`/`SpotLight`/`HemisphereLight`/ `AreaLight` + `Environment`. Packed-RGBA color; radiance = `unpackColorToLinear(color) × intensity`; `range: -1` = infinite; spot cones stored as precomputed cosines.
- `@flighthq/materials` — the 20-material taxonomy constructors + the single `unpackColorToLinear` sRGB→linear seam. Material maps are `Texture | null`; all 3D materials extend `SurfaceMaterial` (`kind` + `alphaMode`/`alphaCutoff`/`alphaType`/`blendMode`/`doubleSided`); PBR extensions _compose_ a `standard: StandardPbrMaterialProperties` block.

## Render-layer architecture (target — building next)

**Frame sequence** — a lit 3D frame is the existing render-effect pipeline with a scene drawn into its target:

```
beginGlRenderEffectPipeline(state, pipeline)       // rgba16f + MSAA + depth scene target
prepareSceneRender(state, scene, camera, lights)   // world matrices, frustum cull, pack light block
drawScene(state, scene, camera, lights)            // depth-test ON, writes linear HDR + depth
endGlRenderEffectPipeline(state, pipeline, fx)     // resolve + tonemap/bloom over the shaded scene
```

`prepare*` lives in `@flighthq/render`; `drawScene` and the passes live in `scene-gl`/`scene-wgpu` (the pipeline in `effects-*` depends on `render-*`, never the reverse). 2D content draws after as an overlay (depth-test off). HDR/MSAA/depth are reused from the existing pipeline; depth feeds the existing depth-dependent effects.

**Camera and lights are draw-arguments, not scene members.** The governing principle:

> `scene` = _what exists_. `camera` = _what are we rendering now?_

The scene graph is observer-agnostic. Because the camera is a parameter of the render _call_, every multi-observer case — shadow maps (a shadow "camera" is just a `Camera` at the light), reflection probes, split-screen, thumbnails, debug views — is free, and rendering from a perspective that is not a node in the graph is never a fight. v1 passes plain `Camera` + `Light[]` data. The optional future convenience — `CameraNode`/`LightNode` plus `findSceneCameras(scene)`/`findSceneLights(scene)` that _produce_ the draw-args — stays additive, never structural.

**Scene nodes (minimal):** `Scene` (root `SceneNode`), `Mesh` (a `SceneNode` carrying `geometry: MeshGeometry` + `materials: Material[]`, one per subset). A bare `SceneNode` is a transform-only group.

**Mesh-material seam:** `registerGlMeshMaterialRenderer(state, MaterialKind, renderer)` — a registry owned by `scene-{backend}` (its own `WeakMap<state, …>`, separate from the 2D quad-material registry; a material kind is either 2D or 3D, never both). A renderer is `{ bind, draw }`: it lazily uploads the mesh GPU buffers (keyed by `geometry.version`, cached in the `MeshGeometryRuntime` slot, freed by `destroyMeshGeometryGlData`), binds the camera matrices + packed light block + the material's uniforms/textures, and draws each subset's indexed range with the right cull/blend state. `glShapeMesh` is the precedent (non-quad indexed draw, own program).

**Shaders:** one uber-shader per backend (shared PBR prelude) + per-material `#define`/`const` feature flags behind a define-key program cache. Material kind, maps-present, alpha mode, and lights/shadows/IBL toggles are all defines, never new files.

**Passes are explicit, named functions the app invokes** (full feature set in scope): `packSceneLightBlock` (std430, sRGB→linear at pack time, `MAX_FORWARD_LIGHTS` a spec constant); `drawSceneShadowMaps` (directional=ortho, spot=perspective, point=cube, PCF in the prelude); `bakeEnvironmentIbl` (prefiltered specular + irradiance + BRDF LUT); `captureOpaqueSceneColor` (opaque → capture → transmissive ordering); area-light LTC. Nothing auto-runs. Combinations (textured/untextured, opaque/mask/blend, double-sided) are shader defines + render state.

**Backends:** WebGPU and WebGL2 (i.e. `wgpu`/`gl`) carry 3D with full parity. Canvas/DOM are 2D only; a Canvas honest-degrade for lighting-independent materials is a possible later addition, not part of the 3D parity target.

## Stage / Texture bridge (2D ↔ 3D)

`Stage` (the 2D `DisplayObject`-graph root) and `Scene` (the 3D `SceneNode`-graph root) are the two graph roots. They do not nest (different node families). **`Texture` is the universal bridge:** any graph renders to a `Texture`, and any `Mesh` + `Material` consumes one. There are no bridge node types — a 2D panel in a 3D world is just a `Mesh` with `createPlaneMeshGeometry` whose material samples a `Stage`-rendered render-target `Texture`; the inverse (3D inside 2D) is a `Scene` rendered to a `Texture` drawn as a `Bitmap`. The passes stay explicit (the user renders each graph), so the two pipelines stay decoupled and tree-shakable.

## Related docs

- `render-backend-support.md` — the **current** per-backend feature-support matrix and the known deltas from this target (blend-mode/stroke-join/bitmap-smoothing/strikethrough gaps, wgpu orthographic, unwired punctual lights). Read it before assuming a feature renders on a backend; this doc is the intended end state, that one is what ships today.
- `3d-materials-architecture.md` — the original judge-panel build spec + §0 settled decisions + the full material taxonomy table. (Its body predates this session's naming; this doc supersedes the render-layer and naming sections.)
- `3d-pipeline-architecture.md` — the 3D pipeline build-out: explicit named passes, picking, animation core, scene-formats/glTF, and build sequencing.
