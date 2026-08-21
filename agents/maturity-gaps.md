# Flight SDK — Production-Readiness Maturity Gaps

A synthesized punch-list merging eight per-area production-readiness audits (3D model import, skeletal
animation/skinning, resource loading/lifecycle, render-backend parity, materials/effects/adjustments,
lighting/3D scene, text/glyph, and animation/simulation/game systems). The point is to surface what is
**not** ready — features a user most likely assumes work but don't. Cites are file/line references from
the audits; treat them as the starting point, not gospel.

Companion docs: [quality-plan](quality-plan.md), [test-depth-review](test-depth-review.md),
[render-backend-support](render-backend-support.md), [effect-adjustment-architecture](effect-adjustment-architecture.md),
[wgpu-3d-parity-spec](wgpu-3d-parity-spec.md), and the guarded
[causal-limitation-prose audit](causal-limitation-prose-audit.md).

**2026-08-21 update:** the physics rows are stale and are marked RESOLVED in place. `physics2d` and
`physics3d` are both built, `collision` has a 3D narrow phase with contact manifolds, and `spatial` has a
3D index. This doc is a synthesized punch-list from a dated audit, so read a row's marker before trusting
its claim; the per-package `status.md` files under `agents/packages/` are the current source.

**2026-07 update:** the AAA workflow closed many gaps below (GPU skinning across all material families on
both GPU backends, morph on gl/wgpu, ShadedMaterial + modifiers on both GPU backends, advanced blend on gl/wgpu,
glTF/OBJ/3DS/MD5/AWD import, and video + compressed textures on gl/wgpu). Rows it closed are marked
RESOLVED; remaining named gaps are tracked in [wgpu-3d-parity-spec](wgpu-3d-parity-spec.md).

Bite legend: **SURPRISE** = looks done / tests green but silently does nothing or wrong; **MAJOR** = real
capability gap a real app hits; **MINOR** = fidelity/edge-case hole or breadth gap clearly unbuilt.

---

## 1. Executive summary — the biggest "will bite you" surprises

Ranked, worst first. Each is something a user assumes works and it does not.

1. **The GPU unit-test-confidence illusion.** Every gl/wgpu code path is *unit*-tested against a *mock*
   WebGL2 context in jsdom (`scene2d-gl/src/glTestHelper.ts:7`); a green unit run is a far weaker
   guarantee for the GPU backends than for Canvas — the real parity gaps (positional UV conventions,
   tint, blend coverage, and skinning) are exactly what a mock can't catch. Real-pixel verification does exist, but it lives
   in the **functional capture harness** (Playwright + SwiftShader software Vulkan for wgpu — see Theme A),
   not in the unit suite; don't read `npm run test` green as "the GPU renders correctly."
2. **Screen-space & G-buffer effects remain uneven.** MotionBlur has a real velocity-texture path on both
   GPU backends, but SSAO and ContactShadows remain colour-derived approximations, ScreenSpaceFog uses a
   flat colour fallback without depth, SSR/TAA have no runner, and VolumetricLight is descriptor-only.
   The control and approximation scenes make those boundaries visible instead of registering passthrough stubs.
3. **~~Skinned glTF/PBR characters render in bind pose on the GPU.~~ RESOLVED.** `HAS_SKIN` spans all five
   real material families on gl and wgpu (classic/pbr/toon/unlit/shaded). Both use a growable
   **RGBA32F data texture** for the bone palette, read with `texelFetch` on gl and `textureLoad` on wgpu,
   so joint count is texture-dimension-bound rather than uniform-budget-bound. The old capacity gate and
   CPU draw fallback are gone; the CPU kernel remains for bounds/picking only. `scene-skinning` verifies a
   posed 80-joint rig on WebGPU.
4. **Non-Latin text is fundamentally broken, not just unstyled.** `textbidi` (UAX #9) and `textsegment`
   (UAX #29) ship as packages but are wired into nothing — layout does no bidi reorder, no grapheme
   segmentation, and line-breaks on `\n`+ASCII-space only. Arabic/Hebrew/Indic/CJK/Thai render wrong. There is
   also no real shaping backend (advances-only `measureText`; no HarfBuzz), and MSDF/SDF fonts parse but no
   shader renders them.
5. **~~Advanced blend modes silently degrade to Normal on both GPU backends.~~ RESOLVED.** The footgun is
   gone: the advanced / non-separable modes (Overlay/HardLight/SoftLight/
   Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) were **removed from the
   `BlendMode` node enum** — which is now fixed-function only — so one can no longer be assigned as a node
   property and silently fall to Normal. They are a separate `AdvancedBlendMode` vocabulary realized as a
   `BlendEffect` composite recipe (`@flighthq/effects` `createBlendEffect` + `blendModeMath`), run on **gl**
   by `@flighthq/effects-gl` `glBlendEffect`, on wgpu by `@flighthq/effects-wgpu` `wgpuBlendEffect`, and
   natively on canvas. DOM has no full-frame effect pipeline. The GPU runners use matching named-backdrop offscreen passes; the WebGPU
   functional scene matches the WebGL raster exactly. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §5.
6. **~~Compressed textures (KTX2/DDS/Basis) are a mirage.~~ NATIVE UPLOAD LANDED ON GL + WGPU.** `render-gl`
   `uploadGlCompressedTextureContainer` now uploads BCn/ETC/ASTC/PVRTC + ATF containers natively via
   `WEBGL_compressed_texture_*` with `detectGlCompressedTextureSupport` capability detection and an optional
   RGBA decode fallback seam. `render-wgpu` mirrors that contract with native BC/ETC2/ASTC device
   features and an RGBA fallback for unavailable families (including PVRTC), so parsed containers reach
   pixels on both GPU backends. Basis-Universal WASM transcode stays spec-only
   ([basis-transcode.md](basis-transcode.md)).
7. **~~Imported material texture references are never resolved / glTF imports nothing textured.~~ IMPORTERS
   COMPLETED (parse); pixel-resolution still asset-pipeline's job.** glTF now reads `primitive.material` (PBR
   materials + textures with sampler/color-space/UV-transform), **all animation channels**, skins, morph
   targets, sparse accessors, and external `.bin`/image URIs. OBJ+MTL, 3DS (`import3ds`: meshes + per-face
   materials + textures), MD5 (mesh + skeleton + `.md5anim`), and AWD (meshes/skins/skeleton-anim/materials)
   all emit materials + `MeshSubset`s. The remaining gap is **downstream**: emitted texture refs stay
   `Unresolved` (`image: null`) until the asset pipeline decodes the bytes — no scene-formats example wires
   that, so a caller ignoring the resolved-material step renders untextured. Draco/meshopt deferred.
8. **~~There is no physics engine.~~ RESOLVED 2026-08-21.** Both packages are built. `physics2d` and
   `physics3d` each own a world, a sequential-impulse solver, joints, islands and sleeping, contact
   generation over a `@flighthq/spatial` broadphase and a `@flighthq/collision` narrow phase, spatial
   queries, and debug geometry. `collision` returns contact manifolds as well as an MTV, in both
   dimensions. What remains is named per package in `agents/packages/physics3d/status.md`: 3D has no CCD
   (2D has linear and rotational), and a 3D convex hull has no mass properties or raycast because a bare
   point list carries no triangulation.

---

## 2. Cross-cutting themes

These patterns recur across every area and matter more than any single gap.

### A. Visual-verification debt — "green but never rendered"
A large theme, but narrower than once believed. **Unit tests** for gl/wgpu use a mock context
(`glTestHelper.ts:7`) and never touch a rasterizer — "renderer tests green" is weak on its own. But the
**functional capture harness does render real pixels in-sandbox for all four backends**, including wgpu:
Playwright's Chromium drives WebGL and — via the bundled SwiftShader software Vulkan adapter
(`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`) plus the GPU-readback present path — WebGPU,
with no host GPU. Re-verified 2026-07-18: of the WebGPU functional scenes, the large majority match the
committed host baselines exactly (`0.00`), and only a small set exceed the fingerprint tolerance on
software-vs-hardware antialiasing. So the regression tier is mostly reproducible in-sandbox for wgpu, not
blind. What remains genuine debt is narrower: scene-format imports still have no `createScene3DFrom*`
functional cell, resource streaming/resolution and glyph/bitmaptext lack production-pixel coverage, and
Camera2D has only a Canvas viewport cell. GPU skinning, compressed textures, and particle emitters now have
functional cells on both GPU backends. "Tests pass" still overstates readiness where only a mock-backed unit
path runs.

### B. WebGPU's remaining gaps are narrow and named
wgpu still has discrete gaps, but the old cluster is gone: GPU skinning, morph deformation,
ShadedMaterial modifiers, `CustomShaderMaterial`, 3D particles, punctual lighting/shadows/IBL, and the
advanced-blend `BlendEffect` all render on both GPU backends with functional cells. `CustomShaderEffect`
still has no Wgpu runner. Wgpu effect targets now honour `sampleCount` > 1 by supersampling 2× per axis
and resolving, matching the Gl cell's visual output; plain 2D WebGPU scenes without an effect pipeline
still lack context-level MSAA. Treat those named gaps as the boundary rather than the former blanket
"second-class" description.

### C. Backend feature-parity is silently uneven for 2D too
Beyond wgpu, several 2D features remain asymmetric: per-instance **ColorTransform tint** is gl/wgpu-only
and draws untinted on Canvas/DOM, while the batch kinds **QuadBatch/Tilemap/BitmapText/ParticleEmitter2D**
have no DOM renderer by design. Ordinary Sprite does have a DOM renderer. Stroke
joins, per-draw smoothing, and text strikethrough are no longer examples: both GPU backends now have
functional proofs for differentiated joins and sampler variants, and all four backends draw line-through.

### D. Descriptor/header layer advertises features with no renderer behind them
The "header layer is the design surface" convention means many fully-formed types exist with no implementation,
reading as shipped: **area lights** (`AreaLightKind` + photometric helpers, but `Scene3DLights` has no `area`
field — unrenderable on any backend), **`InstancedMesh`/`LodMesh`** (typed, not exported from scene, no
renderer), and **seven effects** (autoExposure/barrelDistortion/filmEmulation/panniniProjection/ssr/taa/
volumetricLight — descriptor+tests, zero realization files). `ThreeDsMaterial` is not an example: the 3DS
parser builds a material table and converts each referenced entry to a live BlinnPhong material.

### E. Resource lifecycle: no unload, eviction, or refcount in the live path
Scene-resource streaming grows memory unbounded — cancel-on-drop only aborts in-flight loads; a *resolved*
`Texture.image` is never released (`resolveScene3DResources.ts:65,103`). `assets` has the refcount/dedup/dispose
machinery but is wired to nothing (no package imports it but the barrel), ships no default adapters, and
`loadAssetGroup` silently swallows member failures. The exact large-world stream-in/stream-out use case the
resolver advertises is the one that leaks.

### F. ~~glTF is geometry + skins only~~ — COMPLETED (parse); pixel-resolution downstream
The 2026-07 workflow completed the importer: glTF now reads `primitive.material` (PBR materials + textures
with sampler/color-space/UV-transform), **all animation channels**, skins, **morph targets**, sparse
accessors, and external `.bin`/image URIs. Still deferred: cameras, `KHR_lights_punctual`, `COLOR_0`/
`TEXCOORD_1`, `JOINTS_1`/`WEIGHTS_1` (>4 influences truncated), Draco/meshopt. The remaining live gap is
**downstream, not in the parser**: emitted texture refs are `Unresolved` (`image: null`) until the asset
pipeline decodes the referenced bytes — a caller that skips resolution renders untextured (see Exec #7).

### G. Simulation is detection, not dynamics; broadphase is a single Phase-1 backend
No physics solver anywhere. `collision` is discrete-overlap + MTV only — no swept/TOI (tunneling), no contact
sets, no 3D narrow-phase despite the "unified 2D+3D" charter. `spatial` ships only a uniform grid (quadtree/
sweep-and-prune unbuilt) and has **no persistent enter/stay/exit trigger events** — a bread-and-butter game
feature. Particle sim is CPU-only, and the 3D emitter runs its forces/collisions in 2D.

### H. ~~Stale docs invert reality in both directions~~ — LARGELY RECONCILED
The 2026-07 workflow rewrote the drifted tables. `AGENTS.md` Feature Lookup now lists the completed importers
(glTF/OBJ+MTL/3DS/MD5/AWD, FBX still "not implemented"), 3D particles as gl+wgpu (host-captured), morph, video
texture, and compressed textures; GPU skinning spans the same five material families on both backends here
and in [render-backend-support.md](render-backend-support.md). `shading` is a committed package with Gl and
Wgpu renderers. Residual drift to watch: per-package `charter`/`review`/`status.md` cells may still trail the code
(e.g. a `scene-formats` "stub" score, a `shading/status.md` "code NOT started") — trust the source and the
top-level tables over a package cell that predates the workflow.

### I. Diagnostics remain uneven
Effect-registration misses, texture-resolution misses, and the GPU color-adjustment fold now have opt-in
guards, and scene-coverage explainers distinguish unregistered from unavailable kinds. A caller that does
not enable those guards can still receive silent wrong output, and several non-render subsystems below have
no equivalent diagnostic seam.

---

## 3. By area

### 3D Model Import (`@flighthq/scene3d-formats`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Textured/material-bearing meshes from OBJ/3DS/MD2/MD5 | OBJ + 3DS + MD5 + AWD emit materials (OBJ: one BlinnPhong per `usemtl` + `map_*` refs; 3DS: per-face materials + textures via `import3ds`; MD5: BlinnPhong per section `shader`); MD2 still emits geometry-only. Emitted texture refs stay `Unresolved` until the asset pipeline decodes them | all (parse) | RESOLVED (parse) |
| glTF import is comprehensive | Now reads `primitive.material` (PBR materials + textures with sampler/color-space/UV-transform), **all animation channels**, skins, morph targets, sparse accessors, external `.bin`/image URIs. Deferred: cameras, `KHR_lights_punctual`, `TEXCOORD_1`/`COLOR_0`, `JOINTS_1`, Draco/meshopt. Texture refs `Unresolved` until decoded downstream | all (parse) | RESOLVED (parse) |
| AWD (the good one) opens real files | Compressed AWD unsupported → returns empty scene (`awdParse.ts:85-90`); Away3D defaults to LZMA/deflate. Emitted textures `Unresolved`, `image:null`, never decoded | all | SURPRISE |
| OBJ+MTL attaches materials | Works: `createScene3DFromObj(source, parseObjMaterialLibrary(mtl))` reads the library, resolves one `BlinnPhongMaterial` per `usemtl` (`flushGroup`/`resolveObjMaterial`), and emits a `MeshSubset` per material. Gap is downstream — the emitted `map_Kd` refs are `Unresolved` (no decode) and the aircraft-demo ignores the `materials` arg entirely | all | RESOLVED |
| 3DS respects material + object placement | `import3ds` now parses per-face materials + textures; object-transform placement (`TRANSFORM_MATRIX 0x4160`) may still be partial — verify against a multi-object `.3ds` | all | RESOLVED (materials) |
| MD2 (animated Quake2) imports animation | Only frame 0 kept (`md2Parse.ts:20-21`); skin/texture paths not even modeled | all | MAJOR |
| Imports have ever been rendered | Zero 3D-import example/functional coverage. Once parsed into a Scene3D, skinned content can deform on either GPU backend; the missing evidence is the importer-to-pixel path itself. | gl/wgpu | MAJOR |
| MD5 texture available | `shader` name now emitted as a `BlinnPhongMaterial.diffuseMap` external ref (`md5Parse.ts`), not dropped — but `Unresolved` until decoded; `.md5anim`→clip via `parseMd5Anim` (or folded by `importMd5Mesh`) | all | MINOR |
| USD/FBX/COLLADA/PLY/STL, Draco/meshopt, export direction | Absent; charter/map promise USD; all formats import-only | n/a | MINOR |

### Skeletal Animation & Skinning (`@flighthq/skeleton3d`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Skinned glTF/PBR character GPU-skins | Works on gl: `HAS_SKIN` variant in all five mesh preludes (classic/pbr/unlit/shaded/toon), so glTF's PBR GPU-skins; the draw uploads the static bind pose (not the CPU-posed vertices) so a redundant `updateMeshSkin` no longer double-skins. matcap/debug still have no skin variant. Pixel result is host-verify-only (jsdom can't read back) | gl | SURPRISE |
| WebGPU skins skinned meshes | Works across classic/PBR/toon/unlit/shaded with a growable RGBA32F data-texture palette and distinct `HAS_SKIN` variants; no capacity gate or CPU draw fallback. | wgpu | RESOLVED |
| GPU skinning is verified | `scene-skinning` has WebGL + WebGPU posed-silhouette oracles; the WebGPU scene uses 80 joints and reads the deforming joint at index 79, proving the beyond-64 data-texture path. | gl, wgpu | RESOLVED |
| 2D skeletal animation (Spine/DragonBones) exists | `skeleton2d` is a charter with zero code; no `packages/skeleton2d` | n/a | SURPRISE/MAJOR |
| Feature Lookup "gl, wgpu" for skeletal | GPU skinning spans the same five material families on both GPU backends. | gl, wgpu | RESOLVED |
| Animated character culls/picks correctly | Skinned bounds stay bind-pose (AABB never recomputed); frustum cull + raycast test rest bounds → mis-cull/mis-pick | all | MAJOR |
| >64-joint rig works | Both GPU backends use an RGBA32F data texture (`texelFetch` / `textureLoad`), so joint count is texture-dimension-bound rather than uniform-budget-bound. The WebGPU functional proof uses 80 joints. | gl, wgpu | RESOLVED |
| Morph targets / blend trees / state machines / masked layers / IK / DQS | Morph/blend-shape deformation works on gl/wgpu. The target-free animation core now provides normalized N-way override blending, ordered additive leaves, named timed state transitions, and ordered override/additive layer stacks with channel-index masks. IK / DQS / retargeting remain absent; skinning is LBS-only | gl/wgpu (morph); all (animation core) | RESOLVED (morph + blend/state/layers) |
| >4 influences | Fixed 4; glTF reads only JOINTS_0/WEIGHTS_0, JOINTS_1 dropped (renormalized, silent) | all | MINOR |

### Resource Loading, Streaming & Lifecycle

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| KTX2/Basis/DDS compressed textures render | GL uploads BCn/ETC/ASTC/PVRTC natively when extensions exist; WebGPU uploads BC/ETC2/ASTC natively when device features exist; both use opt-in RGBA decoder fallbacks. `compressed-texture` proves exact GPU-backend parity. Basis-Universal transcode and KTX2 Zstd/BasisLZ inflation remain spec-only. | gl, wgpu | RESOLVED (GPU) |
| Visibility streaming can stream a world in and out | No unload/evict/refcount/budget; resolved `Texture.image` never released (`resolveScene3DResources.ts:65,103`); assets deferred to phase 2 | all | SURPRISE |
| The 6-format resource seam is general | Only AWD emits `SceneResourceRef`; glTF/OBJ/3DS/MD2/MD5 emit none → textured glTF loads untextured, no error | n/a | MAJOR |
| Image decoding works | Only `createImageBitmap`+`OffscreenCanvas` (web-only); tests stub it to a 1×1 — no real PNG/JPEG bytes ever decoded in CI | web only | MAJOR |
| `assets` is a wired pipeline | Ships no default adapters; imported by nothing but barrel; `loadAssetGroup` swallows member failures | n/a | MAJOR |
| Load path is GPU/visually verified | No functional/example exercises streaming/compressed/resolution; jsdom mocks stand in throughout | all | MAJOR |
| Byte-progress telemetry | `report.bytes` always 0 — `bytesLoaded` never incremented, `onBytesProgress` never invoked (`resourceLoader.ts:42,314,317`) | n/a | MINOR |
| AVIF routes by content sniff | `avif` in `webDecodableMimeTypes` but `detectImageMimeType` has no AVIF branch | n/a | MINOR |

### Render Backend Parity

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Unit tests green ⇒ GPU works | Unit tests use mock WebGL2 (`glTestHelper.ts:7`); no draw touches a rasterizer. Real-pixel checks live in the functional capture harness (wgpu runs there via SwiftShader software Vulkan, mostly reproducible in-sandbox) — not the unit suite | gl/wgpu | SURPRISE |
| Orthographic camera on WebGPU | RESOLVED — backend-seam VP depth remap plus `camera-orthographic.webgpu.ts` raster proof | wgpu | RESOLVED |
| Transparent 3D meshes on WebGPU | RESOLVED — two-pass pooled partition, back-to-front sort, blended pipelines, and `scene-transparent.webgpu.ts` proof | wgpu | RESOLVED |
| Overlay/HardLight/Difference/… blend | No longer in the `BlendMode` node enum (fixed-function only) — assigning one as a node property is impossible, killing the silent-degrade. Now an explicit `BlendEffect` composite recipe: realized on gl (`glBlendEffect`), wgpu (`wgpuBlendEffect`), and canvas natively. DOM has no full-frame effect pipeline. `effect-blend-advanced` verifies exact gl/wgpu raster parity. | canvas/gl/wgpu | RESOLVED |
| Per-draw texture smoothing | RESOLVED — Gl applies the texture sampler on every bind; WebGPU selects a LINEAR/NEAREST bind-group variant per draw. `bitmap-perbitmap-smoothing` proves two draws sharing one image can use different filters. | gl/wgpu | RESOLVED |
| Stroke joins (miter/bevel/round) | RESOLVED — both GPU shape renderers tessellate differentiated outlines; `shape-stroke-joints` proves all three joins on all four backends | gl/wgpu | RESOLVED |
| Per-instance ColorTransform tint | gl/wgpu-only; Canvas/DOM draw untinted (no color-transform renderer) — flash-on-hit/team-color silently fails | canvas/dom | MAJOR |
| Darken/Lighten (MIN/MAX) | Can't fold `(1-src.a)` on gl/wgpu → transparent surround darkens/clips backdrop at edges | gl/wgpu | MAJOR |
| Group/container `blendMode` | Whole-subtree flatten unverified/likely absent; no render-to-texture group-blend path found | all | MAJOR |
| QuadBatch/Tilemap/BitmapText/ParticleEmitter2D on DOM | Deliberately no DOM batch renderer; use the documented Sprite or HtmlView canvas-embedding path | dom | BY DESIGN |
| wgpu 2D-blend parity covered | RESOLVED — cross-backend Normal/Add parity is asserted in `node-blend-modes.webgpu.ts`; all six fixed Shape states plus Bitmap Multiply remain asserted in the WebGPU-only `node-blend-modes-fixed.webgpu.ts` suite | wgpu | RESOLVED |
| Text strikethrough | RESOLVED — `glRichText` and `wgpuRichText` draw the same line-through as Canvas/DOM; `text-strikethrough` proves all four backends | gl/wgpu | RESOLVED |
| cacheAsBitmap out-of-frame | WebGPU out-of-frame bake RESOLVED with a standalone encoder and `scene2d-cache` raster proof; DOM still bakes in-frame | dom | MINOR |

### Materials, Shading, Effects & Adjustments

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| SSAO/SSR/TAA/motion-blur/fog work on GPU | MotionBlur has a real velocity-texture path on Gl/WGPU; SSAO and ContactShadows are colour-derived approximations, ScreenSpaceFog is flat without depth, and SSR/TAA are honestly unregistered controls | gl/wgpu | SURPRISE |
| All 53 effects render | Seven are descriptor-only on every backend: AutoExposure, BarrelDistortion, FilmEmulation, PanniniProjection, SSR, TAA, VolumetricLight. Unregistered operations are skipped and guards report them rather than running passthrough stubs. | all | SURPRISE |
| A registered Canvas post-FX runner changes pixels | RESOLVED — all 18 Canvas runners are real; the 31 passthrough registrations were removed, and unsupported kinds are absent rather than silently inert | canvas | RESOLVED |
| ShadedMaterial + modifiers cross-backend | `@flighthq/shading` modifier tier (fresnel/normalPerturb/emissive/envReflect/fog/vertexDisplace/dissolve/toon) is realized by `shadedGlMeshMaterialRenderer` and `shadedWgpuMeshMaterialRenderer`, with tangent-space normal mapping on both. `shading-globe` and `shading-normal-map` carry WebGPU raster proof ([wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §4). | gl, wgpu | RESOLVED |
| customShader material/effect escape hatch on GPU | `CustomShaderMaterial` is realized on Gl and Wgpu, and 3D particles render on both. `CustomShaderEffect` remains Gl-only; Wgpu has no effect runner/source registry for it. | gl/wgpu material; gl effect | MAJOR |
| Saturation/hue/sepia/channel-mix fold onto sprites | Inline GPU fold is affine-only; off-diagonal terms dropped unless re-routed as full-frame Effect (`colorAdjustmentResolution.ts:67`); guard is opt-in so drop is silent; no canvas inline fold | gl/wgpu partial, canvas none | MAJOR |
| Punctual lights/shadows verified on wgpu; ortho; area lights | WebGPU point/spot/hemisphere selection, directional shadows (PBR + classic), and ortho are RESOLVED with raster proofs; area lights remain descriptor-only on all backends | all | MAJOR |

### Lighting & 3D Scene

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Area lights render | `Scene3DLights` has no `area` field (`Scene3DLights.ts:17-21`); `packSceneLightBlock` no area refs; grep across scene-gl/wgpu/render → nothing | none | SURPRISE |
| Point/spot lights cast shadows | Shadows directional-only, single ortho map, no cascades/CSM, no point/spot/cube (`shadowCamera.ts:14` sole export) | gl/wgpu (dir only) | SURPRISE |
| WebGPU 3D lighting/shadow/IBL works | RESOLVED with WebGPU raster proofs for point/spot/hemisphere lights, IBL, orthographic projection, and directional shadows received by both PBR and classic materials (`shadow-directional` / `shadow-classic`) | wgpu | RESOLVED |
| `InstancedMesh`/`LodMesh` ship | Header types only; no `create*`, not exported from scene barrel, no renderer consumes them | none | SURPRISE |
| Frustum culling is automatic | `cullSceneNodeByFrustum` exists but no renderer calls it (grep across render/scene-gl/wgpu → none); every mesh drawn every frame | gl/wgpu (manual) | MAJOR |
| Orthographic on WebGPU | RESOLVED — VP depth remap and functional baseline | wgpu | RESOLVED |
| Particles (3D) status | RESOLVED on both GPU backends with instanced billboard renderers and `particle-emitter-3d` functional cells | gl/wgpu | RESOLVED |
| IBL is production quality | Real split-sum on both GPU backends with `env-ibl` functional cells, but baked at deliberately modest software resolutions | gl/wgpu | MINOR |
| Photometric units are real | Lux/Candela anchored at arbitrary "100000 units = 1.0"; directional needs ~+1.5-+3 EV manual fudge | all | MINOR |

### Text & Glyph

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| RTL/bidi + grapheme-correct text | `textbidi`(UAX#9)/`textsegment`(UAX#29) wired into nothing; only barrel+types consume them; layout does no reorder/segmentation → Arabic renders in logical order | all | SURPRISE |
| Real shaping (ligatures/kerning/contextual forms) | Only advances-only `measureText`; `textshaper-canvas` has no `shapeRun`; no HarfBuzz/opentype backend | all | SURPRISE |
| MSDF/SDF fonts render crisp | Encoding + format codec parse `msdf`/`sdf` but no shader applies distance fields; sampled as raw RGB mush; `bitmaptext` never reads `encoding` | gl/wgpu, canvas | SURPRISE |
| Word wrap handles CJK/Thai | `\n`+ASCII-space only (`textLineBreaks.ts:28`, `textLayout.ts:215`); no UAX#14; CJK/Thai/ZWSP unhandled | all | MAJOR |
| BitmapText covered by regression suite | Headless rasterizer blank; stub backend draws identical boxes ("not a production text renderer", `glyphatlas/status.md`) — glyph shapes/packing/kerning never verified | gl/wgpu/headless | MAJOR |
| gl/wgpu text is GPU glyph/atlas rendering | Whole-label 2D-canvas rasterization uploaded as texture (`glTextLabel.ts:52-56`); DOM+font-load bound, no worker, re-rasterized on change | gl/wgpu | MAJOR |
| Strikethrough renders everywhere | RESOLVED — Canvas/DOM/Gl/Wgpu all draw line-through; `text-strikethrough` covers the four backends | all | RESOLVED |
| NativeText is cross-backend | dom-only (`domNativeText.ts`); no canvas/gl/wgpu | dom | MINOR |
| bidi/segmentation are well-tested | `textbidi` flagged THIN (7+6 `it`s for full UAX#9); `textsegment` light (5/15/7) | n/a | MINOR |

### Animation, Simulation & Game Systems

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| collision+spring+spatial = physics | **RESOLVED 2026-08-21.** `physics2d` and `physics3d` are both built and shipped: worlds, sequential-impulse solvers, joints, islands/sleeping, generated contacts, queries, debug geometry | headless | RESOLVED |
| 3D particles / real 3D physics | Rendering is realized on Gl and Wgpu, but simulation forces/collisions remain planar — only spawn velocity and `gravityZ` touch z (`stepParticleEmitter3D.ts:21-30`) | gl/wgpu render; CPU sim | SURPRISE |
| collision is a complete narrow-phase | **Mostly resolved 2026-08-21.** Contact manifolds in 2D and 3D, capsule and convex hull in 3D over a GJK/EPA support registry, 2D swept/TOI. Remaining: no 3D swept (fast 3D movers tunnel), no concave, and a 3D hull cannot be raycast from outside | headless | MINOR |
| spatial: pick index, get trigger events | Uniform grid only in both dimensions (quadtree/octree/sweep-and-prune unbuilt); no persistent enter/stay/exit pair tracking. The 3D seam and its grid backend landed 2026-08-21 | headless | MINOR |
| GPU-backed animation renders correctly | Particle emitters now have Gl/Wgpu functional cells and orthographic Wgpu rendering is covered. Spritesheet/movieclip and most Camera2D behavior remain unit- or Canvas-only. | gl/wgpu | MAJOR |
| snapshot interpolate/restore robust | Different-shape, number↔non-number, dotted-path schema, extra-key restore untested — netcode/replay hits these | headless | MAJOR |
| Spritesheet seek is correct | `seekSpritesheetPlayerToFrame` broken for non-forward directions — ping-pong/reverse land wrong frame | canvas/gl/wgpu | MAJOR |
| Particle sim scales | CPU-only, single-threaded; no GPU sim (deferred to future compute-wgpu) | all | MINOR |
| tween/clock/easing edge cases | zero-duration tween div-by-zero, negative deltaTime/scale, smoothstep `edge0===edge1` untested | headless | MINOR |
| animation loop modes/perf | Linear scan restarts index 0 each call (no binary search); loop is a boolean (no ping-pong/finite repeat) | headless | MINOR |

---

## 4. Recommended sequencing

To close the highest-bite gaps, in order. Rationale: establish trust in verification first, then fix the
silent-wrong cases, then fill the biggest capability holes.

1. **Maintain and broaden real GPU visual verification (Theme A).** The browser-capable capture path now
   renders Gl and SwiftShader-backed Wgpu pixels and can re-capture functional baselines. Extend that evidence
   to the remaining import/resource/text gaps instead of treating mock-backed unit green as pixel proof.

2. **Fix the remaining silent-wrong output cases (no new features, just correctness + diagnostics).**
   ColorTransform tint remains untinted on Canvas/DOM, and the affine-only adjustment fold can drop
   saturation/hue. Advanced blend routing, per-draw smoothing, and stroke joins are resolved and have
   functional proofs. Where a true fix is large, at minimum add the guard-layer warnings (Theme I) so the
   drop stops being silent.

3. **~~Close the first WebGPU parity gaps that were outright broken (Theme B).~~ SECTIONS 1–5 COMPLETE.**
   Transparent-pass sorting (§1), the orthographic NDC-Z remap (§2), GPU skinning (§3), ShadedMaterial (§4),
   and the advanced-blend `BlendEffect` runner (§5) now have WebGPU implementations and functional evidence.
   Continue with the still-named effect/MSAA gaps rather than the now-closed light/shadow/IBL cluster.

4. **~~Make skinned characters actually deform on the GPU (Exec #3).~~ DONE ON GL + WGPU.** `HAS_SKIN` spans
   all five families (classic/pbr/toon/unlit/shaded); both backends use an RGBA32F data-texture palette
   (`texelFetch` / `textureLoad`) without a uniform-capacity fallback, and `scene-skinning` proves the posed
   silhouette on both, including an 80-joint Wgpu rig.

5. **Finish the effect G-buffer (Theme, Exec #2).** MotionBlur now consumes a scene velocity texture; feed
   depth/normal/history so SSAO, ContactShadows, ScreenSpaceFog, SSR, and TAA can replace their approximation
   or absent paths. The 31 Canvas passthrough registrations are already retired. Keep the seven descriptor-only
   effects honestly absent until each has a real implementation.

6. **~~Complete glTF import (Themes F/H).~~ DONE (parse).** glTF now emits materials/textures + all animation
   channels + skins + morph + sparse accessors + external URIs; OBJ/3DS/MD5/AWD emit materials; the
   `AGENTS.md` Feature Lookup + these tables are reconciled. Remaining: MD2 animation, 3DS object transforms
   (verify), FBX/USD, and the **downstream** texture-ref decode (item 7 below), plus Draco/meshopt.

7. **Resource lifecycle (Theme E).** Add refcount/unload/eviction to the streaming path and wire `assets` in
   with default adapters + surfaced group-load failures, so streaming stops leaking. Wire the imported
   texture refs through decode so imported meshes render textured (the parse side is done; resolution is not).
   Compressed-texture native upload landed on both GPU backends; the remaining container gap is
   Basis-Universal transcode (spec-only).

8. **Text i18n pipeline (Exec #4).** Wire `textbidi`/`textsegment` into layout, add a real shaping backend and
   an MSDF shader, and implement UAX #14 line breaking. Large, but non-Latin text is broken today, not merely
   unstyled.

9. **Physics + simulation depth (Theme G, Exec #8).** Longest lead time and clearly-unbuilt, so last: a
   rigid-body solver over `collision` (add swept/TOI + contact sets first), quadtree/sweep broadphase, and
   persistent trigger events in `spatial`. Fix the 3D particle emitter to run true 3D forces or clearly scope
   it as planar.
