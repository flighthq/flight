# Flight SDK — Production-Readiness Maturity Gaps

A synthesized punch-list merging eight per-area production-readiness audits (3D model import, skeletal
animation/skinning, resource loading/lifecycle, render-backend parity, materials/effects/adjustments,
lighting/3D scene, text/glyph, and animation/simulation/game systems). The point is to surface what is
**not** ready — features a user most likely assumes work but don't. Cites are file/line references from
the audits; treat them as the starting point, not gospel.

Companion docs: [quality-plan](quality-plan.md), [test-depth-review](test-depth-review.md),
[render-backend-support](render-backend-support.md), [effect-adjustment-architecture](effect-adjustment-architecture.md),
[wgpu-3d-parity-spec](wgpu-3d-parity-spec.md) (the un-postpone plan for every WebGPU 3D gap this doc marks open).

**2026-07 update:** the GL-only AAA workflow closed many gaps below **on gl only** (GPU skinning across all
material families, morph, ShadedMaterial + modifiers, the advanced-blend re-architecture, glTF/OBJ/3DS/MD5/AWD
import, video + compressed textures). Rows it closed are marked RESOLVED/RESOLVED (gl); their WebGPU
counterparts stay open and are specced in [wgpu-3d-parity-spec](wgpu-3d-parity-spec.md).

Bite legend: **SURPRISE** = looks done / tests green but silently does nothing or wrong; **MAJOR** = real
capability gap a real app hits; **MINOR** = fidelity/edge-case hole or breadth gap clearly unbuilt.

---

## 1. Executive summary — the biggest "will bite you" surprises

Ranked, worst first. Each is something a user assumes works and it does not.

1. **The GPU unit-test-confidence illusion.** Every gl/wgpu code path is *unit*-tested against a *mock*
   WebGL2 context in jsdom (`displayobject-gl/src/glTestHelper.ts:7`); a green unit run is a far weaker
   guarantee for the GPU backends than for Canvas — the real parity gaps (joins, smoothing, tint, blend
   modes, skinning) are exactly what a mock can't catch. Real-pixel verification does exist, but it lives
   in the **functional capture harness** (Playwright + SwiftShader software Vulkan for wgpu — see Theme A),
   not in the unit suite; don't read `npm run test` green as "the GPU renders correctly."
2. **Screen-space & G-buffer effects are theater.** SSAO/SSR/TAA/motion-blur/contact-shadows/volumetric-light
   are descriptor-only or passthrough/approximate placeholders on *every* backend including gl/wgpu, because
   the effect pipeline is color-only (no depth/normal/velocity/history buffers). They pass regression baselines
   that captured the stub output.
3. **~~Skinned glTF/PBR characters render in bind pose on the GPU.~~ CLOSED ON GL; WGPU OPEN.** The 2026-07
   GL workflow wired `HAS_SKIN` across **all five** real material families on gl (classic/pbr/toon/unlit/
   shaded — grep `HAS_SKIN` in scene-gl), a per-context capacity gate (`getGlSkinJointCapacity`) with a CPU
   fallback above capacity (`isGpuSkinnedDraw`, `drawGlScene.ts:35`), and the CPU kernel in
   `@flighthq/skeleton3d` for bounds/picking, so a PBR glTF character GPU-skins on gl. **WebGPU still has
   zero GPU skinning** (grep confirms no joint/skin path in scene-wgpu) — a skinned mesh renders in bind
   pose on wgpu. The un-postpone plan is [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3. Note the
   shipped GL palette is a **uniform mat4 array**, not the bone-palette data texture the design decision
   named; the spec carries the data-texture/storage-buffer target for the wgpu port.
4. **Non-Latin text is fundamentally broken, not just unstyled.** `textbidi` (UAX #9) and `textsegment`
   (UAX #29) ship as packages but are wired into nothing — layout does no bidi reorder, no grapheme
   segmentation, and line-breaks on `\n`+ASCII-space only. Arabic/Hebrew/Indic/CJK/Thai render wrong. There is
   also no real shaping backend (advances-only `measureText`; no HarfBuzz), and MSDF/SDF fonts parse but no
   shader renders them.
5. **~~Advanced blend modes silently degrade to Normal on both GPU backends.~~ RE-ARCHITECTED; WGPU
   REALIZATION OPEN.** The footgun is gone: the advanced / non-separable modes (Overlay/HardLight/SoftLight/
   Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) were **removed from the
   `BlendMode` node enum** — which is now fixed-function only — so one can no longer be assigned as a node
   property and silently fall to Normal. They are a separate `AdvancedBlendMode` vocabulary realized as a
   `BlendEffect` composite recipe (`@flighthq/effects` `createBlendEffect` + `blendModeMath`), run on **gl**
   by `@flighthq/effects-gl` `glBlendEffect` and natively on canvas/dom. **wgpu has no `BlendEffect` runner
   yet** — the effect no-ops on wgpu (a missing realization of an explicit effect, not a silent-degrade).
   [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §5.
6. **~~Compressed textures (KTX2/DDS/Basis) are a mirage.~~ NATIVE UPLOAD LANDED ON GL.** `render-gl`
   `uploadGlCompressedTextureContainer` now uploads BCn/ETC/ASTC/PVRTC + ATF containers natively via
   `WEBGL_compressed_texture_*` with `detectGlCompressedTextureSupport` capability detection and an optional
   RGBA decode fallback seam, so a parsed `.ktx2`/`.dds` reaches pixels on **gl**. Basis-Universal WASM
   transcode stays spec-only ([basis-transcode.md](basis-transcode.md)); wgpu compressed upload is unbuilt.
7. **~~Imported material texture references are never resolved / glTF imports nothing textured.~~ IMPORTERS
   COMPLETED (parse); pixel-resolution still asset-pipeline's job.** glTF now reads `primitive.material` (PBR
   materials + textures with sampler/color-space/UV-transform), **all animation channels**, skins, morph
   targets, sparse accessors, and external `.bin`/image URIs. OBJ+MTL, 3DS (`import3ds`: meshes + per-face
   materials + textures), MD5 (mesh + skeleton + `.md5anim`), and AWD (meshes/skins/skeleton-anim/materials)
   all emit materials + `MeshSubset`s. The remaining gap is **downstream**: emitted texture refs stay
   `Unresolved` (`image: null`) until the asset pipeline decodes the bytes — no scene-formats example wires
   that, so a caller ignoring the resolved-material step renders untextured. Draco/meshopt deferred.
8. **There is no physics engine.** `physics2d`/`physics3d` are empty charters; `collision` returns an MTV but
   never resolves, integrates, or owns a world, and has no swept/TOI (fast movers tunnel) and no contact sets.
   "collision + spring + spatial" is detection, not dynamics — the user writes the entire solver.

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
blind. What remains genuine debt: whole feature classes have **no functional/example coverage at all**:
scene-format imports (no `createSceneFrom*` anywhere under
examples/functional), GPU skinning (no `*skin*` functional scene; the example exercises the CPU path),
streaming/compressed-texture/resource-resolution, glyph/bitmaptext (headless only ever draws stub white
boxes — `glyphatlas/status.md`), particle emitters, and camera2d view-matrix application
(`test-depth-review.md:126-128`). "Tests pass" systematically overstates readiness for anything GPU-rendered.

### B. WebGPU is a second-class citizen everywhere
wgpu lags gl in every domain audited, and the 2026-07 GL workflow **widened** the gap by design (GL-only
scope): the 3D features it closed on gl have **no wgpu counterpart**. wgpu today has **no GPU skinning** (any
material — gl now has it across all five families), **no ShadedMaterial renderer** (gl has the full modifier
stack), **no morph deformation** (gl CPU-blends), **no advanced-blend `BlendEffect` runner** (gl + canvas/dom
realize it), **no video/compressed-texture upload** (gl-only), plus the pre-existing **no custom-shader
material/effect**, **no 3D-particle renderer** (wait — 3D particles *do* render on wgpu via host capture; see
that row), a silent **transparent-pass failure** (single-pass, no blend state — every transparent mesh draws
opaque), **orthographic renders blank** (NDC-Z `[0,1]` vs `[-1,1]` remap missing), and **no `.webgpu.ts`
functional baseline** for any light/shadow/IBL/ortho scene — so the punctual-lighting parity that
`render-backend-support.md` gap #8 marks "DONE on both gl and wgpu" is claimed by inspection, never by
evidence. The "four co-equal backends" framing is false; treat wgpu 3D as partial. The concrete un-postpone
plan for every one of these is [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md).

### C. Backend feature-parity is silently uneven for 2D too
Beyond wgpu: several 2D features that Canvas/DOM render are dropped on gl/wgpu — advanced **blend modes**
(wrong, not absent), **stroke joins** (miter/bevel/round undifferentiated), per-bitmap **smoothing** flag
(ignored; first-draw filter sticks via cached texture), **text strikethrough** (no branch). And the *reverse*
asymmetry: per-instance **ColorTransform tint** is gl/wgpu-only, drawing untinted on Canvas/DOM. **Sprite/
QuadBatch/Tilemap have no DOM renderer at all.** Every one of these is silent — the wrong output survives a
green run and a glance on one backend.

### D. Descriptor/header layer advertises features with no renderer behind them
The "header layer is the design surface" convention means many fully-formed types exist with no implementation,
reading as shipped: **area lights** (`AreaLightKind` + photometric helpers, but `SceneLights` has no `area`
field — unrenderable on any backend), **`InstancedMesh`/`LodMesh`** (typed, not exported from scene, no
renderer), **six effects** (autoExposure/barrelDistortion/contactShadows/filmEmulation/panniniProjection/
volumetricLight — descriptor+tests, zero realization files), **`ThreeDsMaterial`** (dead exported type). The
header promises breadth the renderers don't cover.

### E. Resource lifecycle: no unload, eviction, or refcount in the live path
Scene-resource streaming grows memory unbounded — cancel-on-drop only aborts in-flight loads; a *resolved*
`Texture.image` is never released (`resolveSceneResources.ts:65,103`). `assets` has the refcount/dedup/dispose
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
texture, and compressed textures; the skinning story is corrected here (gl across all five families, wgpu
open) and in [render-backend-support.md](render-backend-support.md). `shading` is a committed package + gl
renderer. Residual drift to watch: per-package `charter`/`review`/`status.md` cells may still trail the code
(e.g. a `scene-formats` "stub" score, a `shading/status.md` "code NOT started") — trust the source and the
top-level tables over a package cell that predates the workflow.

### I. Diagnostics gap: the silent-drop pattern has no guards
Nearly every SURPRISE above is silent — no warning, no `explain*`, no guard fires when materials evaporate,
blend modes degrade, skinning falls to bind pose, the affine-only adjustment fold drops saturation/hue, or an
effect is an unregistered passthrough. The inversion-rule guard layer that should catch these misuse-vs-
unsupported cases is largely unbuilt for the gaps that most need it.

---

## 3. By area

### 3D Model Import (`@flighthq/scene-formats`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Textured/material-bearing meshes from OBJ/3DS/MD2/MD5 | OBJ + 3DS + MD5 + AWD emit materials (OBJ: one BlinnPhong per `usemtl` + `map_*` refs; 3DS: per-face materials + textures via `import3ds`; MD5: BlinnPhong per section `shader`); MD2 still emits geometry-only. Emitted texture refs stay `Unresolved` until the asset pipeline decodes them | all (parse) | RESOLVED (parse) |
| glTF import is comprehensive | Now reads `primitive.material` (PBR materials + textures with sampler/color-space/UV-transform), **all animation channels**, skins, morph targets, sparse accessors, external `.bin`/image URIs. Deferred: cameras, `KHR_lights_punctual`, `TEXCOORD_1`/`COLOR_0`, `JOINTS_1`, Draco/meshopt. Texture refs `Unresolved` until decoded downstream | all (parse) | RESOLVED (parse) |
| AWD (the good one) opens real files | Compressed AWD unsupported → returns empty scene (`awdParse.ts:85-90`); Away3D defaults to LZMA/deflate. Emitted textures `Unresolved`, `image:null`, never decoded | all | SURPRISE |
| OBJ+MTL attaches materials | Works: `createSceneFromObj(source, parseObjMaterialLibrary(mtl))` reads the library, resolves one `BlinnPhongMaterial` per `usemtl` (`flushGroup`/`resolveObjMaterial`), and emits a `MeshSubset` per material. Gap is downstream — the emitted `map_Kd` refs are `Unresolved` (no decode) and the aircraft-demo ignores the `materials` arg entirely | all | RESOLVED |
| 3DS respects material + object placement | `import3ds` now parses per-face materials + textures; object-transform placement (`TRANSFORM_MATRIX 0x4160`) may still be partial — verify against a multi-object `.3ds` | all | RESOLVED (materials) |
| MD2 (animated Quake2) imports animation | Only frame 0 kept (`md2Parse.ts:20-21`); skin/texture paths not even modeled | all | MAJOR |
| Imports have ever been rendered | Zero example/functional coverage; skinned imports deform on gl only, wgpu unwired | gl/wgpu | MAJOR |
| MD5 texture available | `shader` name now emitted as a `BlinnPhongMaterial.diffuseMap` external ref (`md5Parse.ts`), not dropped — but `Unresolved` until decoded; `.md5anim`→clip via `parseMd5Anim` (or folded by `importMd5Mesh`) | all | MINOR |
| USD/FBX/COLLADA/PLY/STL, Draco/meshopt, export direction | Absent; charter/map promise USD; all formats import-only | n/a | MINOR |

### Skeletal Animation & Skinning (`@flighthq/skeleton3d`)

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Skinned glTF/PBR character GPU-skins | Works on gl: `HAS_SKIN` variant in all five mesh preludes (classic/pbr/unlit/shaded/toon), so glTF's PBR GPU-skins; the draw uploads the static bind pose (not the CPU-posed vertices) so a redundant `updateMeshSkin` no longer double-skins. matcap/debug still have no skin variant. Pixel result is host-verify-only (jsdom can't read back) | gl | SURPRISE |
| WebGPU skins skinned meshes | Still zero skinning in scene-wgpu (grep → none); any material renders bind pose. Un-postpone plan: [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3 (palette bind group, capacity gate + CPU fallback, HAS_SKIN pipeline variant per family) | wgpu | SURPRISE |
| GPU skinning is verified | Still no functional skin scene; the gl bind-pose/palette/gate logic is unit-tested (jsdom), but the deformed pixels are host-verify-only. An app calling `updateMeshSkin` on a gl-rendered skinned mesh is now safe (bind-pose upload), but that coexistence isn't pixel-gated | gl (unverified) | SURPRISE |
| 2D skeletal animation (Spine/DragonBones) exists | `skeleton2d` is a charter with zero code; no `packages/skeleton2d` | n/a | SURPRISE/MAJOR |
| Feature Lookup "gl, wgpu" for skeletal | GPU skinning now spans all five gl families (not gl-classic-only), but is absent on wgpu — the "wgpu" claim is aspirational until [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3 lands | — | MAJOR (wgpu) |
| Animated character culls/picks correctly | Skinned bounds stay bind-pose (AABB never recomputed); frustum cull + raycast test rest bounds → mis-cull/mis-pick | all | MAJOR |
| >64-joint rig works | Fixed on gl: palette sized per-context from `MAX_VERTEX_UNIFORM_VECTORS` (64 floor, 256 cap) via `getGlSkinJointCapacity`, and `drawGlScene` gates GPU skinning on `jointCount ≤ capacity`, falling back to a rigid draw over the CPU-posed vertices (`updateMeshSkin`) when a rig exceeds it — no more out-of-range palette reads. wgpu still uncapped/unwired | gl (wgpu open) | RESOLVED |
| Morph targets / IK / blend trees / DQS | Morph/blend-shape deformer now built on gl (mesh CPU-blends base + Σ wᵢ·targetᵢ, `updateMeshMorph`; glTF/MD2 import emit morph); wgpu morph unbuilt. IK / blend trees / DQS still absent; LBS-only; no retargeting | gl (morph); all (rest) | RESOLVED (morph, gl) |
| >4 influences | Fixed 4; glTF reads only JOINTS_0/WEIGHTS_0, JOINTS_1 dropped (renormalized, silent) | all | MINOR |

### Resource Loading, Streaming & Lifecycle

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| KTX2/Basis/DDS compressed textures render | `render-gl` `uploadGlCompressedTextureContainer` now uploads BCn/ETC/ASTC/PVRTC + ATF natively (`WEBGL_compressed_texture_*` + `detectGlCompressedTextureSupport` + RGBA decode fallback) → renders on **gl**. Basis-Universal transcode spec-only; wgpu compressed upload unbuilt; KTX2 Zstd/BasisLZ super-compression not inflated | gl | RESOLVED (gl) |
| Visibility streaming can stream a world in and out | No unload/evict/refcount/budget; resolved `Texture.image` never released (`resolveSceneResources.ts:65,103`); assets deferred to phase 2 | all | SURPRISE |
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
| Orthographic camera on WebGPU | Renders blank — NDC-Z `[0,1]` vs `[-1,1]` remap missing; `camera-orthographic` scoped gl-only. Fix: [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §2 (VP depth-correction premultiply) | wgpu | SURPRISE |
| Transparent 3D meshes on WebGPU | `drawWgpuScene` is single-pass with no blend state / no back-to-front sort → every `blend`-alphaMode or faded mesh draws opaque + writes depth. gl is two-phased (`drawGlScene.ts:47–59`). Fix: [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §1 | wgpu | SURPRISE |
| Overlay/HardLight/Difference/… blend | No longer in the `BlendMode` node enum (fixed-function only) — assigning one as a node property is impossible, killing the silent-degrade. Now an explicit `BlendEffect` composite recipe: realized on gl (`glBlendEffect`) + canvas/dom native; **wgpu runner unbuilt** ([wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §5) | gl/canvas/dom (wgpu open) | RESOLVED (re-architected) |
| Per-bitmap `smoothing` flag | Ignored on gl/wgpu; global filter, texture cached so first-draw filter sticks → pixel-art blurry | gl/wgpu | MAJOR |
| Stroke joins (miter/bevel/round) | Not differentiated on gl/wgpu (caps work); scoped canvas/dom | gl/wgpu | MAJOR |
| Per-instance ColorTransform tint | gl/wgpu-only; Canvas/DOM draw untinted (no color-transform renderer) — flash-on-hit/team-color silently fails | canvas/dom | MAJOR |
| Darken/Lighten (MIN/MAX) | Can't fold `(1-src.a)` on gl/wgpu → transparent surround darkens/clips backdrop at edges | gl/wgpu | MAJOR |
| Group/container `blendMode` | Whole-subtree flatten unverified/likely absent; no render-to-texture group-blend path found | all | MAJOR |
| Sprite/QuadBatch/Tilemap on DOM | No DOM renderer — renders nothing | dom | MAJOR |
| wgpu 2D-blend/ortho parity covered | `node-blend-modes`/`camera-orthographic` have no `.webgpu.ts` baseline | wgpu | MAJOR |
| Text strikethrough | No `strikethrough` branch in `glRichText.ts:170`/`wgpuRichText.ts:184` | gl/wgpu | MINOR |
| cacheAsBitmap out-of-frame; atlas pivot | Bakes in-frame on dom/wgpu; `TextureAtlasRegion.pivotX/Y` never read | dom/wgpu | MINOR |

### Materials, Shading, Effects & Adjustments

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| SSAO/SSR/TAA/motion-blur/fog work on GPU | Pipeline is color-only (no depth/normal/velocity/history); SSR/TAA = passthrough, SSAO/SMAA = crude single-pass, fog = screen-Y gradient proxy; baselines captured the stubs | gl/wgpu (canvas passthrough) | SURPRISE |
| All 51 effects render | 6 are descriptor-only — no realization file in effects-{gl,wgpu,canvas} (autoExposure/barrelDistortion/contactShadows/filmEmulation/panniniProjection/volumetricLight); return passthrough sentinel | all | SURPRISE |
| Canvas post-FX stack works | 31 of ~40 canvas effects are passthrough no-ops (`canvasSsaoEffect.ts:8` etc.); bevel/gradientBevel/gradientGlow/innerGlow/innerShadow have no canvas file despite Feature Lookup listing "canvas" | canvas | MAJOR |
| ShadedMaterial + modifiers cross-backend | `@flighthq/shading` modifier tier (fresnel/normalPerturb/emissive/envReflect/fog/vertexDisplace/dissolve/toon) + `shadedGlMeshMaterialRenderer` shipped on **gl**, with the previously-disabled normal map fixed. scene-wgpu still has no ShadedMaterial renderer → subset skipped, draws nothing ([wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §4); `shading-globe` no `.webgpu.ts` | gl (wgpu open) | RESOLVED (gl) |
| customShader material/effect escape hatch on GPU | gl-only; no `customShader…Wgpu…`, no `wgpuCustomShaderEffect`; 3D particles gl-only too | gl only | MAJOR |
| Saturation/hue/sepia/channel-mix fold onto sprites | Inline GPU fold is affine-only; off-diagonal terms dropped unless re-routed as full-frame Effect (`colorAdjustmentResolution.ts:67`); guard is opt-in so drop is silent; no canvas inline fold | gl/wgpu partial, canvas none | MAJOR |
| Punctual lights/shadows verified on wgpu; ortho; area lights | Light/shadow scenes are `.webgl.ts` only (no wgpu baseline); ortho blank on wgpu; area lights descriptor-only, unwired | wgpu / all | MAJOR |

### Lighting & 3D Scene

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| Area lights render | `SceneLights` has no `area` field (`SceneLights.ts:17-21`); `packSceneLightBlock` no area refs; grep across scene-gl/wgpu/render → nothing | none | SURPRISE |
| Point/spot lights cast shadows | Shadows directional-only, single ortho map, no cascades/CSM, no point/spot/cube (`shadowCamera.ts:14` sole export) | gl/wgpu (dir only) | SURPRISE |
| WebGPU 3D lighting/shadow/IBL/ortho works | No `.webgpu.ts` for light-point/spot/hemisphere/env-ibl/shadow-directional/camera-orthographic; symmetric to gl by inspection only | wgpu | SURPRISE |
| `InstancedMesh`/`LodMesh` ship | Header types only; no `create*`, not exported from scene barrel, no renderer consumes them | none | SURPRISE |
| Frustum culling is automatic | `cullSceneNodeByFrustum` exists but no renderer calls it (grep across render/scene-gl/wgpu → none); every mesh drawn every frame | gl/wgpu (manual) | MAJOR |
| Orthographic on WebGPU | Blank (NDC-Z remap missing); functional test gl-only | wgpu | MAJOR |
| Particles (3D) status | Map says "not implemented" but GL renderer exists; no wgpu twin; no functional test | gl only | MAJOR |
| IBL is production quality | Real split-sum but baked at "deliberately modest" software resolutions; wgpu unverified | gl (wgpu unverified) | MINOR |
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
| Strikethrough renders everywhere | gl/wgpu handle underline only | gl/wgpu | MINOR |
| NativeText is cross-backend | dom-only (`domNativeText.ts`); no canvas/gl/wgpu | dom | MINOR |
| bidi/segmentation are well-tested | `textbidi` flagged THIN (7+6 `it`s for full UAX#9); `textsegment` light (5/15/7) | n/a | MINOR |

### Animation, Simulation & Game Systems

| What a user assumes works | Reality + cite | Backends | Bite |
| --- | --- | --- | --- |
| collision+spring+spatial = physics | No solver/joints/integration; `physics2d`/`physics3d` empty charters (no package dir); collision returns MTV, doesn't resolve | n/a | SURPRISE |
| 3D particles (per map) / real 3D physics | Map says "not implemented" but sim node + GL renderer exist; no wgpu renderer; forces/collisions cast to 2D — only spawn vel + `gravityZ` touch z (`stepParticleEmitter3D.ts:21-30`) | gl only | SURPRISE |
| collision is a complete narrow-phase | Discrete-overlap + MTV only; no swept/TOI (fast movers tunnel), no contact sets, no capsule/concave, no 3D despite "unified 2D+3D" charter | headless | MAJOR |
| spatial: pick index, get trigger events | Uniform grid only (quadtree/sweep-and-prune unbuilt); no persistent enter/stay/exit pair tracking; no 3D backends | headless | MAJOR |
| GPU-backed animation renders correctly | Particles/spritesheet/movieclip/camera2d jsdom-only, never pixel-verified (`test-depth-review.md:126-128`); wgpu no blend + blank ortho | gl/wgpu | MAJOR |
| snapshot interpolate/restore robust | Different-shape, number↔non-number, dotted-path schema, extra-key restore untested — netcode/replay hits these | headless | MAJOR |
| Spritesheet seek is correct | `seekSpritesheetPlayerToFrame` broken for non-forward directions — ping-pong/reverse land wrong frame | canvas/gl/wgpu | MAJOR |
| Particle sim scales | CPU-only, single-threaded; no GPU sim (deferred to future compute-wgpu) | all | MINOR |
| tween/clock/easing edge cases | zero-duration tween div-by-zero, negative deltaTime/scale, smoothstep `edge0===edge1` untested | headless | MINOR |
| animation loop modes/perf | Linear scan restarts index 0 each call (no binary search); loop is a boolean (no ping-pong/finite repeat) | headless | MINOR |

---

## 4. Recommended sequencing

To close the highest-bite gaps, in order. Rationale: establish trust in verification first, then fix the
silent-wrong cases, then fill the biggest capability holes.

1. **Establish real GPU visual verification (Theme A).** Stand up a browser-capable capture path (or a
   documented external host loop) so functional baselines can actually be re-captured and trusted. Until this
   exists, every fix below is unverifiable and every "green" claim is suspect. This is the force multiplier —
   it converts inspection-only claims into evidence across skinning, lighting, effects, blend modes, text.

2. **Fix the silent-wrong output cases (no new features, just correctness + diagnostics).** These make Canvas-
   correct designs look broken on GPU with no warning: advanced blend modes → Normal (gl/wgpu), per-bitmap
   smoothing ignored, stroke joins undifferentiated, ColorTransform tint untinted on Canvas/DOM, affine-only
   adjustment fold dropping saturation/hue. Where a true fix is large, at minimum add the guard-layer warnings
   (Theme I) so the drop stops being silent.

3. **Close the WebGPU parity gaps that are outright broken (Theme B).** The GL-only 2026-07 workflow left
   these as the wgpu backlog, now specced end-to-end in [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md):
   the silent transparent-pass failure (§1, wrong-output — do first), orthographic-blank NDC-Z remap (§2,
   black-screen), wgpu GPU skinning (§3), ShadedMaterial-on-wgpu (§4), and the wgpu advanced-blend
   `BlendEffect` runner (§5). Add `.webgpu.ts` functional baselines for every light/shadow/IBL/ortho scene so
   parity is evidenced. Each spec item is a translation of a shipped GL file.

4. **~~Make skinned characters actually deform on the GPU (Exec #3).~~ DONE ON GL.** `HAS_SKIN` now spans all
   five gl families (classic/pbr/toon/unlit/shaded), the palette is per-context capacity-gated with a CPU
   fallback above capacity, and the CPU kernel + skinned bounds live in `@flighthq/skeleton3d`. Remaining: the
   wgpu port (folded into item 3 above) and a functional skin scene that exercises the GPU path, not the CPU
   crutch.

5. **Wire the effect G-buffer (Theme, Exec #2).** Feed depth/normal/velocity/history buffers so SSAO/SSR/TAA/
   motion-blur/fog stop being placeholders. This unblocks the largest "looks AAA, does nothing" cluster. Then
   register or clearly de-list the 6 descriptor-only effects and the 31 canvas no-ops.

6. **~~Complete glTF import (Themes F/H).~~ DONE (parse).** glTF now emits materials/textures + all animation
   channels + skins + morph + sparse accessors + external URIs; OBJ/3DS/MD5/AWD emit materials; the
   `AGENTS.md` Feature Lookup + these tables are reconciled. Remaining: MD2 animation, 3DS object transforms
   (verify), FBX/USD, and the **downstream** texture-ref decode (item 7 below), plus Draco/meshopt.

7. **Resource lifecycle (Theme E).** Add refcount/unload/eviction to the streaming path and wire `assets` in
   with default adapters + surfaced group-load failures, so streaming stops leaking. Wire the imported
   texture refs through decode so imported meshes render textured (the parse side is done; resolution is not).
   Compressed-texture native upload landed on gl (`uploadGlCompressedTextureContainer`); remaining is
   Basis-Universal transcode (spec-only) and the wgpu upload path.

8. **Text i18n pipeline (Exec #4).** Wire `textbidi`/`textsegment` into layout, add a real shaping backend and
   an MSDF shader, and implement UAX #14 line breaking. Large, but non-Latin text is broken today, not merely
   unstyled.

9. **Physics + simulation depth (Theme G, Exec #8).** Longest lead time and clearly-unbuilt, so last: a
   rigid-body solver over `collision` (add swept/TOI + contact sets first), quadtree/sweep broadphase, and
   persistent trigger events in `spatial`. Fix the 3D particle emitter to run true 3D forces or clearly scope
   it as planar.
