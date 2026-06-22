# Flight 3D Materials & Lighting — Canonical Architecture

Build spec for the full PBR material + forward-lighting system. Produced by a design judge-panel (3 architects → 3 judges → synthesis → gap critique), with the critic's P0/P1 gaps folded in. Read this before working any phase below.

## 0. SETTLED NAMING & CURRENT BUILD SCOPE (finalized 2026-06-22 — supersedes any conflicting naming below)

Refined in design discussion. These decisions override the `World*Node` names and bridge design in §2–§7:

- **Two graph roots:** `Stage` (2D — the `DisplayObject`-graph root, mirror of `Scene`; renders to the screen _or_ to a `Texture`) and `Scene` (3D — the `SceneNode`-graph root). Rename package `@flighthq/world` → `@flighthq/scene`; drop the `World` prefix from every type.
- **`SceneNode`** is the 3D base node (parallels `DisplayObject`). Concrete scene nodes drop the suffix: `Mesh`, `Camera`, `DirectionalLight`, … (NOT built in the current pass — see scope.)
- **Canonical local transform = `Matrix4`.** There is no `Transform3D` type. TRS is free-function molecules (compose/decompose). Internal traits `HasTransform2D` / `HasTransform3D` stay as-is (internal).
- **`Texture` is the universal bridge.** Any graph renders to a `Texture`; any `Mesh` + `Material` consumes one. No `DisplayPanel` / `SceneView` / `Plane` node types — a "panel" is a `Mesh` with `createPlaneMeshGeometry`. (If a bundled bridge node is ever wanted, it follows the rule "a node in family A with a `.root` into family B." Parked, not built.)
- **Rename device `@flighthq/camera` → `@flighthq/webcam`** (type `Camera` → `Webcam`) to free `Camera` for the 3D camera.
- Arity in math names (`Vector3`, `Matrix4`, `Quaternion`) is identity and fine; domain suffixes (`3D`) are avoided on public types.

**Current build scope — primitives → materials. NOT the render pipeline / scene-node graph / bridges.** Build in dependency order:

1. **Renames:** `world` → `scene`; device `camera` → `webcam`.
2. **Geometry math (`@flighthq/geometry`, extend):** `Vector3`, `Vector4`, `Quaternion`; `Matrix4` compose/decompose + `lookAt` (perspective/ortho exist); `transposeMatrix3` + `setMatrix3NormalFromMatrix4`; `AABB`, `BoundingSphere`, `Frustum`.
3. **`@flighthq/mesh` (new):** `MeshGeometry` + `VertexLayout`/`VertexAttribute`/`VertexSemantic`/ `VertexFormat`/`PrimitiveTopology`/`MeshSubset`; builders `createPlane/Box/Sphere/Cylinder/Cone/Torus/ QuadMeshGeometry`; `computeMeshGeometryNormals/Tangents/Bounds(out)`.
4. **`@flighthq/texture` (new):** `Texture` (image ref + `Sampler` + `colorSpace` + uv-transform), `Sampler`, `CubeTexture`, `TextureWrap`/`TextureFilter`/`TextureColorSpace`.
5. **`@flighthq/camera` (new):** `Camera` (`Projection` + view `Matrix4`), `Projection` / `PerspectiveProjection` / `OrthographicProjection`; view-projection helpers.
6. **`@flighthq/lighting` (new):** light DATA types `AmbientLight`/`DirectionalLight`/`PointLight`/ `SpotLight`/`HemisphereLight`/`AreaLight` + `Environment` (IBL/skybox source). Pure data (color/intensity/range/cone/shadow params); placement/node-ness deferred.
7. **`@flighthq/materials` (extend):** the full descriptor taxonomy + constructors (§2), the packed-RGBA `Color` convention + the single `unpackColorToLinear` sRGB→linear seam + per-texture colorSpace.

Types-first: every type lands in `@flighthq/types` first, then the impl package. Gates: `npm run fix`, `packages:check`, `exports:check`, `order`, `api`. **Deferred to a later forward pass:** `SceneNode` graph + `Mesh`/`Camera`/`Light` _nodes_, the forward-lighting render pipeline, per-backend mesh-material renderers, bridges, functional render tests.

## 1. Decision Summary

Spine: **minimal-forward 3D PBR layered on the existing render-effect scene target** — grafted with a first-class glTF-aligned material taxonomy + a separate `@flighthq/world-gltf` importer, an std430-friendly interleaved vertex record, precomputed-cosine light structs, and stylized specials (Matcap/Toon). It beat "Forward+ day-one" (front-loads froxel encoding before a lit pixel) and "WebGL-first, defer WebGPU/Canvas" (bakes in WebGL-only assumptions a late parity gate must unwind).

| # | Decision | Rationale | Beat |
| --- | --- | --- | --- |
| D1 | **Single-pass forward lighting**, packed light UBO/storage block, `MAX_FORWARD_LIGHTS` a **spec constant** (`#define`/`const`, never inlined). Clustered Forward+ is a non-breaking later phase. | Composes natively into the one `rgba16f` scene target; deferred needs an MRT G-buffer that duplicates the post stack and can't cheap-MSAA. | Clustered-forward day-one. |
| D2 | **3D nests in the shared `HierarchyNode` graph** — new kinds `WorldMeshNodeKind` / `WorldLightNodeKind` / `WorldCameraNodeKind`. `prepareWorldRender(state, root, camera)` mirrors **`prepareDisplayObjectRender`** (the real precedent — see §0 correction). One frame = `beginPipeline → drawWorld → draw 2D → endPipeline`. | `WorldNode` already exists as an inert `HasTransform3D` node with a `worldMatrix` runtime slot + family gate — 3D is additive, not a parallel renderer. | A 3D scene/camera object outside the hierarchy. |
| D3 | **Reuse the existing scene target by calling render functions while it is bound.** `drawWorld` lives in `render-webgl/webgpu/canvas`; the _app_ sequences `begin…Pipeline → drawWorld → end…Pipeline`. The pipeline (`effects-webgl`) depends ON `render-webgl`; never invert that. | The pipeline doc says "the scene renders into the target between begin/end." Nothing draws scene content there yet → **proving it is an explicit Phase-1 deliverable.** | Putting `drawWorld` in `effects-webgl` (inverts the dep, breaks tree-shaking). |
| D4 | **Distinct `*Kind` per material type** (incl. each PBR extension); extensions **compose** a `standard` field-block of `StandardPBRMaterial`, they do not inherit. | The kind symbol is the type id **and** the registry/batch key; one mega-kind forces a renderer to branch on field presence — opposite of data-descriptor + kind-keyed-renderer. | One `StandardPBRMaterialKind` + shader-permutation fields. |
| D5 | **Sibling mesh material-renderer interface** (`WebGLMeshMaterialRenderer` etc.) registered in the **same kind registry** as the quad renderer; `resolveWebGLMeshMaterialRenderer` is a parallel lookup. `webglShapeMesh` (non-quad indexed `drawElements`, world-transformed, own program) is the precedent. | The existing `WebGLMaterialRenderer` is quad-instance-only and "may not change base geometry/topology" — a mesh PBR program over interpolated normals/tangents/UVs has no representation there. | Widening `WebGLMaterialRenderer` (muddies the 2D batch path). |
| D6 | **Canvas2D = honest degrade, hard line.** Full fidelity only for lighting-independent materials (Unlit, Emissive, Matcap); flat/Gouraud per-face Lambert as the lit ceiling; **sentinel-skip (no error)** for PBR microfacet, extensions, shadows, transmission. Canvas excluded from raster parity by design (own loose baseline). | Rules demand honest degradation with sentinels, not a faked software PBR rasterizer. | Per-vertex software Phong/perspective-UV renderer (scope-creep trap). |

## 0. Phase-0 Corrections (folded-in critic P0 gaps — apply before any other phase)

These are header-precision fixes the build MUST honor:

1. **Precedent is `prepareDisplayObjectRender(state, source)`** in the shared `@flighthq/render` package — there is **no `prepareSpriteRender`**. `prepareWorldRender` lives in `@flighthq/world` and is sequenced by the app (it calls `render` functions); the world package depends on `render`.
2. **Color-space / HDR convention (biggest correctness hole).** Packed `0xrrggbbaa` is **sRGB albedo (0–1)**. A packed 8-bit integer **cannot carry HDR**, so light/emissive **radiance = `unpackColorToLinear(color) × intensity`** (float). Pin sRGB↔linear at exactly one named seam, `unpackColorToLinear(out, color)` in `@flighthq/materials`; forbid per-backend re-decoding. Add a **per-texture `colorSpace: 'srgb' | 'linear'` flag** on `MaterialTextureSlot` (baseColor/emissive = srgb; normal/metallicRoughness/occlusion = linear) — without it every textured material is gamma-wrong.
3. **Normal matrix.** `matrix3.ts` has `inverseMatrix3` but no transpose. Add `transposeMatrix3(out, src)`
   - `setMatrix3NormalFromMatrix4(out, m4)` (inverse-transpose of upper 3×3) in Phase 0, or lit materials are wrong under non-uniform scale.
4. **No `unknown` in the header.** Replace `MeshGeometryRuntime.webglMeshData: unknown` etc. with named opaque branded interfaces in `@flighthq/types`; pair every `geometry.version` upload with `destroyMeshGeometryGPUData(state, geometry)` (GPU resource → `destroy*`, not `dispose*`).
5. **Phase-1 gate is GPU-honest.** WebGPU regression baselines are environment-coupled and use the bespoke readback path. Phase 1's hard gate is **smoke + parity on Canvas/WebGL**; WebGPU is **smoke-only** at the gate unless the readback wiring is front-loaded into Phase 0.
6. **Reuse the existing 2D `BlendMode` enum** for `alphaMode`-adjacent blending — do not invent a parallel 3-value enum that can't express additive/multiply. Add **premultiplied-vs-straight alpha** declaration.
7. **`SceneCamera` is fully specified in the header**: `near`, `far`, `projection: 'perspective' | 'orthographic'`, fov/ortho size, `jitter: Vector2` (TAA), and a stored **inverse-view-projection** (consumed by TAA/velocity/fog/DoF, which already ship).
8. **Utility materials are pass infrastructure, not nice-to-have**: ship `DepthMaterial`, `NormalMaterial`, and a `VertexColorMaterial` path (the vertex layout already reserves `color0`), since the shadow/velocity passes need depth/normal output anyway.

## 2. Complete Material Taxonomy

Colors are packed `0xrrggbbaa` (sRGB albedo). Every map field is `MaterialTextureSlot | null`. Shared trailer on lit materials: `alphaMode`, `alphaCutoff: number`, `doubleSided: boolean`, `blendMode` (reuse 2D enum). Extension materials carry a `standard` field-block (D4).

| Material | Kind | Category | Maps | Canvas2D |
| --- | --- | --- | --- | --- |
| UnlitMaterial | `UnlitMaterialKind` | unlit | baseColor | **Full** |
| EmissiveMaterial | `EmissiveMaterialKind` | unlit | emissive | **Full** (emissiveStrength>1 → bloom on GPU) |
| MatcapMaterial | `MatcapMaterialKind` | special | matcap | **Full** (lighting-independent) |
| ToonMaterial | `ToonMaterialKind` | special (cel) | baseColor, ramp | Partial (stepped N·L per-face) |
| WireframeMaterial | `WireframeMaterialKind` | special (debug) | — | **Full** (needs barycentric attr / `fwidth`) |
| VertexColorMaterial | `VertexColorMaterialKind` | utility | — (color0) | **Full** |
| DepthMaterial | `DepthMaterialKind` | utility/pass | — | n/a (pass infra) |
| NormalMaterial | `NormalMaterialKind` | utility/pass | normal | n/a (pass infra) |
| LambertMaterial | `LambertMaterialKind` | classic | diffuse, emissive | Partial (per-face N·L) |
| PhongMaterial | `PhongMaterialKind` | classic | diffuse, specular, normal | Partial (→ flat Lambert) |
| BlinnPhongMaterial | `BlinnPhongMaterialKind` | classic | diffuse, specular, normal | Partial (→ flat Lambert) |
| StandardPBRMaterial | `StandardPBRMaterialKind` | pbr-core | baseColor, metallicRoughness, normal, occlusion, emissive | Partial (Lambert approx) |
| SpecularGlossinessPBRMaterial | `SpecularGlossinessPBRMaterialKind` | pbr-core | diffuse, specularGlossiness, normal, occlusion, emissive | Partial (converts→MR at bind) |
| ClearcoatPBRMaterial | `ClearcoatPBRMaterialKind` | pbr-ext | +clearcoat, clearcoatRoughness, clearcoatNormal | Degrade→StandardPBR |
| SheenPBRMaterial | `SheenPBRMaterialKind` | pbr-ext | +sheenColor, sheenRoughness | Degrade→StandardPBR |
| AnisotropyPBRMaterial | `AnisotropyPBRMaterialKind` | pbr-ext | +anisotropy (needs tangents) | Degrade→StandardPBR |
| TransmissionVolumePBRMaterial | `TransmissionVolumePBRMaterialKind` | pbr-ext | +transmission, thickness | Sentinel → alpha-blend |
| IridescencePBRMaterial | `IridescencePBRMaterialKind` | pbr-ext | +iridescence, iridescenceThickness | Degrade→StandardPBR |
| SpecularPBRMaterial | `SpecularPBRMaterialKind` | pbr-ext | +specular, specularColor | Degrade→StandardPBR |
| SubsurfacePBRMaterial | `SubsurfacePBRMaterialKind` | pbr-ext (Flight) | +subsurface, thickness | Sentinel (non-interop) |

Existing 2D `ColorTransformMaterial` / `UniformColorTransformMaterial` untouched.

## 3. Header Design (`@flighthq/types`) — see §0 corrections

New files: `MeshGeometry.ts` (`VertexAttributeLayout`/`VertexSemantic`/`VertexFormat`/`PrimitiveTopology`/ `MeshGeometry`/`MeshGeometryRuntime` with **named** GPU-data slot types), `MaterialTextureSlot.ts` (`MaterialTextureSlot` w/ `colorSpace` flag, `TextureSamplerDescriptor`, `TextureWrap`, `TextureFilter`, mipmap policy, `KHR_texture_transform` offset/scale/rotation), every `*Material.ts` + kind, `Light.ts`

- `AmbientLight`/`DirectionalLight`/`PointLight`/`SpotLight`/`HemisphereLight`/`AreaLight`/`ImageBasedLight` (flat structs, packed-RGBA color, precomputed cosines, per-light `castsShadow`/`shadowBias`/`normalBias`/ `pcfRadius`, `range: -1`=infinite), `SceneCamera.ts` (fully specified per §0.7 — **note `Camera.ts` already exists as the device/photo seam, so 3D camera is `SceneCamera`**), `WorldMeshNode`/`WorldLightNode`/ `WorldCameraNode` traits+kinds+runtimes, `WebGL/WebGPU/CanvasMeshMaterialRenderer.ts`, `WorldRenderProxy3D.ts`.

Canonical PBR vertex: position(3)+normal(3)+tangent(4,w=handedness)+uv0(2) = 12 f32 / 48 bytes, interleaved std430-friendly (one record = GL `vertexAttribPointer` table = `GPUVertexBufferLayout` = C `offsetof` table). `joints0`/`weights0`/`color0` reserved. Index auto-promotes Uint16→Uint32 past 65k. **Handedness pinned: right-handed, CCW front-face, tangent `w`-sign per glTF** — documented at top of `quaternion.ts` and `MeshGeometry.ts`.

`@flighthq/geometry` additions: `Quaternion` (+create/multiply/slerp/`setMatrix4FromQuaternion`), `Frustum` (+`createFrustumFromMatrix4`/`intersectsFrustumAABB`), AABB helpers, `transposeMatrix3`, `setMatrix3NormalFromMatrix4`.

## 4. Lighting Pipeline

Single-pass forward. `prepareWorldRender` gathers active lights into a packed, std430-aligned `Float32Array` block (count header + fixed-stride records), uploaded once per `drawWorld` to a UBO (WebGL2) / storage buffer (WebGPU). Materials output **linear HDR radiance** into the `rgba16f` scene attachment; tonemap + bloom are existing render-effects over the resolved target (so `emissiveStrength>1` drives bloom for free). Shared GLSL/WGSL **PBR prelude** + per-kind `#define`/`const` feature flags = uber-shader behind a **define-key program cache** from the first PBR phase.

- **MSAA + sampleable depth** (WebGL2 can't sample multisample depth): Phase 2 adds a **depth-resolve blit** to render-target machinery; until then depth-effects over MSAA 3D run at `sampleCount 1`.
- **WebGPU MSAA**: pool is `sampleCount 1` today → WebGPU 3D ships HDR+depth first, MSAA pool variants in Phase 4b.
- **Velocity**: reuse the existing **per-node prev-`worldMatrix` delta** pattern (`ctx.sceneVelocityTexture` already supports per-object motion blur) → `renderWorldVelocity` in Phase 6, lower-risk than "all new."
- **Shadows** (Phase 5): opt-in pre-pass reusing depth-sampled targets (dir=ortho/CSM-later, spot=perspective, point=cube/dual-paraboloid), PCF in the shared prelude.
- **IBL** (Phase 4): prefiltered specular cube + irradiance/SH-L2 + BRDF LUT bake (shared render-to-target helper sequenced into P2 so P4 and P5 both consume it). SH-L2 is the single ambient representation for Ambient/Hemisphere/IBL.
- **Transmission** (Phase 5): named intra-frame seam `captureWebGLOpaqueSceneColor(state, pipeline, pool)` borrowing from the existing pool + `opaque → capture → transmissive` draw-order split, sequenced before 2D content.

Per-backend: **WebGPU primary** (full PBR + extensions, storage-buffer lights, IBL, shadows, format-aware HDR pipelines; MSAA after pool grows). **WebGL2 full parity** (GLSL 300 es, rgba16f over `EXT_color_buffer_float`). **Canvas2D honest degrade** (D6).

## 5. Scene-Graph & Render Integration

`WorldMeshNode`/`WorldLightNode`/`WorldCameraNode` are `Node` traits over `HasTransform3D` (mesh also `HasMaterial` + geometry ref), nesting via `addNodeChild`; kinds gate the world family. A 3D root may child under a 2D container (viewport) or vice versa. Registration is opt-in (`registerRenderer(state, WorldMeshNodeKind, worldMeshRenderer)` + `registerWebGLMeshMaterialRenderer(state, kind, …)`), no top-level side effects.

`prepareWorldRender(state, root, camera)`: walk subtree, `worldMatrix = parentWorld × localMatrix` (out-aliasing-safe `multiplyMatrix4`), compute view/projection from `SceneCamera`, gather visible lights, frustum-cull against `boundsMin/Max`.

One frame:

```
beginWebGLRenderEffectPipeline(state, pipeline)        // rgba16f/MSAA/depth scene target
prepareWorldRender(state, worldRoot, camera)
drawWorld(state, worldRoot, camera)                    // depthMask(true)/depthFunc(LESS), writes HDR+depth(+velocity)
prepareDisplayObjectRender(state, uiRoot)
drawDisplayObjects(state, uiRoot)                      // depthMask(false)/depthFunc(ALWAYS) overlay
endWebGLRenderEffectPipeline(state, pipeline, effects) // resolve + post FX over shaded 3D
```

**Depth-state is scoped per subtree by the draw call** — written rule, not implicit. 2D after 3D = overlay; 2D under a world subtree in graph order draws behind.

## 6. Package Layout

| Package | Status | Role |
| --- | --- | --- |
| `@flighthq/types` | extended | All mesh/material/light/camera/texture types + kinds + the three `*MeshMaterialRenderer` interfaces + `WorldRenderProxy3D`. **Built first, in full.** |
| `@flighthq/geometry` | extended | `Quaternion`, `Frustum`, AABB, `transposeMatrix3`, normal-matrix. Pure math. |
| `@flighthq/materials` | extended | 3D material **constructors** + equality/clone + `unpackColorToLinear`. Plain data, no backend (deps: entity, types). |
| `@flighthq/world` | extended | node constructors, `SceneCamera`, mesh-geometry builders (box/sphere/plane/cylinder/torus), `computeMeshGeometryNormals/Tangents/Bounds`, `prepareWorldRender`, `packLightBlock`, `buildLightClusters` (later). No GPU code. |
| `@flighthq/render-webgl` | extended | `worldMeshRenderer`, `registerWebGLMeshMaterialRenderer` + per-kind GLSL, GPU mesh upload/destroy by `version`, PBR prelude, depth-resolve blit, shadow/IBL passes, `renderWorldVelocity`. **`drawWorld` lives here.** |
| `@flighthq/render-webgpu` | extended | WGSL mirror (storage-buffer lights, format-aware HDR pipelines, MSAA pool variants in 4b). |
| `@flighthq/render-canvas` | extended | `canvasWorldMeshRenderer`: CPU project + backface-cull + painter-sort + flat/Gouraud Lambert; sentinel-skip per D6. |
| `@flighthq/world-gltf` | **new** | glTF/GLB → Flight nodes/meshes/materials/lights; maps MR core + `KHR_materials_*` + `KHR_lights_punctual` + `KHR_texture_transform` to the taxonomy. Separate neighbor package so non-glTF apps tree-shake it away. |

`npm run size` must prove the 3D shader libs + `world-gltf` tree-shake from a 2D-only example after P1 and P6.

## 7. Phased Build Plan

`[S]` sequential gate · `[∥]` parallelizable once prerequisite lands.

- **Phase 0 — Header + math foundations [S].** Full taxonomy in `@flighthq/types` (+§0 corrections), geometry math (quaternion/frustum/AABB/normal-matrix). Nothing renders. Test: geometry unit tests with out-param aliasing, `npm run check`, `npm run api`, `npm run exports:check`.
- **Phase 1 — One lit textured mesh, the gate [S].** `StandardPBRMaterial` box/sphere under one `DirectionalLight` + `AmbientLight`, `drawWorld` into the effect-pipeline scene target. **Retires the unproven "draw a scene graph into the scene target" assumption.** Test: smoke + parity (Canvas/WebGL; WebGPU smoke-only per §0.5) → commit baselines → regression; `npm run size` proves tree-shake.
- **Phase 2 — Full light set + multi-light + depth/MSAA/HDR proof [S].** Point/Spot/Hemisphere/Ambient
  - `packLightBlock`; depth feeding `ctx.sceneDepthTexture`; depth-resolve blit; bloom-over-emissive; frustum cull; the shared render-to-target bake helper (for P4/P5). Test: multi-light + bloom + SSAO/fog reading depth.
- **Phase 3 — Classic + special + remaining core PBR [∥ after P2].** Unlit, Lambert, Phong, BlinnPhong, SpecGloss, Emissive, Matcap, Toon, Wireframe, VertexColor, Depth/Normal utility. `alphaMode` + blend + `doubleSided`. Test: one functional test per family; tight oracle for lighting-independent ones.
- **Phase 4 — IBL + format-aware/MSAA hardening [∥ after P2].** `ImageBasedLight` (cube + irradiance/SH + BRDF LUT bake); 4b grows WebGPU MSAA pool. Test: chrome sphere reflecting a committed env asset; WebGPU MSAA edge-AA.
- **Phase 5 — Shadows + transmission + extensions [S after P3+P4].** Shadow maps + PCF; transmission opaque-copy seam; clearcoat/sheen/anisotropy/iridescence/specular/transmission-volume/subsurface; AreaLight LTC. Test: shadow oracle; per-extension scenes (GPU backends; Canvas excluded).
- **Phase 6 — Velocity/TAA over 3D + glTF import + Forward+ [∥ after P5].** `renderWorldVelocity` (reuse per-node prev-matrix delta); `@flighthq/world-gltf`; `buildLightClusters` behind the spec constant. Test: motion-blur/TAA over moving mesh; load a known MR glTF asset, baseline; glTF→material unit tests; many-light cluster correctness; `npm run size` confirms `world-gltf` tree-shakes.

**Fan-out:** P0→P1→P2 strict. After P2, **P3 ∥ P4**. P5 needs both. P6 fans into velocity / glTF / Forward+ sub-tracks.

## 8. Deferrals

Clustered Forward+ (function + spec-constant swap only, P6), CSM cascades & point-cube shadows (base single-map ships P5; header stable), true BSSRDF subsurface (P5 ships wrapped-diffuse approx, flagged non-interop), skinning/morph-targets (`joints0`/`weights0` reserved; animation later track), instanced-mesh descriptor (header reservation worth adding), Canvas PBR fidelity (permanently, by design D6).

**Top residual risks:** shader-permutation explosion (mitigated by shared-prelude + define-key cache; escalate to build-time codegen only if program count balloons), transmission-vs-2D draw ordering, and bundle discipline (must be _proven_ by `npm run size`, not asserted).
