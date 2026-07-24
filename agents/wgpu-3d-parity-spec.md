# WebGPU 3D Parity — Implementation Spec

**Status: PARTIALLY IMPLEMENTED. Sections 1 and 2 are complete; sections 3–5 remain spec-only.** The
2026-07 AAA workflow was scoped GL-only; several 3D features it closed on WebGL2 (`scene-gl`,
`effects-gl`, `render-gl`, `displayobject-gl`) still have **no WebGPU counterpart**. This is the
remaining un-postpone plan: the concrete
gaps in `@flighthq/scene-wgpu` / `@flighthq/render-wgpu` / `@flighthq/effects-wgpu`, and — for each — the
already-shipped GL path it must mirror, so a later worker can implement without re-deriving the design.

Read alongside [render-backend-support.md](render-backend-support.md) (the current-state matrix, which
now documents these gaps) and [maturity-gaps.md](maturity-gaps.md) (Theme B, "WebGPU is a second-class
citizen"). The GL reference for each item is cited by file so the mirror is a translation, not a redesign.

## Ground rules for the wgpu port (unchanged from the SDK contract)

- **Mirror, don't redesign.** Each `scene-wgpu` file is the WGSL mirror of a `scene-gl` file
  (`drawWgpuScene.ts` ↔ `drawGlScene.ts`, `wgpuMeshPipeline.ts` ↔ `glMeshProgram.ts`/`glLitProgram.ts`,
  each `*WgpuMeshMaterialRenderer.ts` ↔ its `*GlMeshMaterialRenderer.ts`). Keep the mirror explicit:
  same function names with the backend swapped (`drawGlMeshSubset` → `drawWgpuMeshSubset`), same
  comments describing the shared contract, same seam boundaries.
- **Types first.** Everything cross-package these features need already lives in `@flighthq/types`
  (`SceneRenderProxy.jointMatrices`, `MeshMorph`, `AdvancedBlendMode`, the `BlendMode` fixed-function
  enum). The wgpu port consumes those types; it does **not** add new ones except backend-private runtime
  slots (which belong on `WgpuSceneRuntime` / `WgpuRenderStateRuntime`, never on `@flighthq/types`).
- **No new bundle tax on the primitive.** A feature variant (skin, morph, a blend effect) must compile
  as a separate pipeline permutation / separate pass, never a config branch that grows the base
  non-skinned/non-morphed draw. This is the same rule the GL preludes follow with their `#define`
  variants (a HAS_SKIN program is a distinct compiled program, not a runtime `if`).
- **Verify with the functional capture harness, not unit tests.** wgpu unit tests run against a mock
  device and never touch a rasterizer. Each item below lands its parity evidence as a `.webgpu.ts`
  functional baseline captured via the SwiftShader software-Vulkan adapter (see
  [maturity-gaps.md](maturity-gaps.md) Theme A). "wgpu unit green" is not parity.

---

## 1. Silent transparent-pass failure (highest priority — wrong output, no diagnostic)

**Implemented.** `drawWgpuScene` now partitions pooled opaque/blended draw lists, sorts blended entries
back-to-front, propagates resolved node alpha, and selects immutable `|opaque` / `|blend` pipeline
variants. `scene-transparent.webgpu.ts` proves an opaque backing layer and two transparent layers.

### The gap

`drawWgpuScene` (`packages/scene-wgpu/src/drawWgpuScene.ts`) is **single-pass**: it walks
`list.visibleMeshes` once, in scene-graph order, and draws every subset through its material renderer
with the pipeline's own depth-stencil state (`depthWriteEnabled: true`, `depthCompare: 'less'` in
`createWgpuMeshPipeline`, `wgpuMeshPipeline.ts:125`). There is **no blend state on any mesh pipeline**
(`fragment.targets: [{ format }]` with no `blend` member, `wgpuMeshPipeline.ts:119`), **no opaque/blend
partition, and no back-to-front sort**. Consequently:

- A `blend`-alphaMode material (glTF `alphaMode:"BLEND"`, or any surface material a user marks blended)
  is composited with **no alpha blending at all** — it writes opaque pixels and its depth, occluding
  what is behind it. Transparency silently does not work.
- A partially-faded object (`node.alpha < 1`, resolved via `getSceneNodeWorldAlpha`) likewise draws
  fully opaque.
- Draw order is scene-graph order, not depth order, so even if blending were enabled, overlapping
  transparent surfaces would composite in the wrong order.

This is a **SURPRISE-class** bug: the scene renders (not blank), so it looks done, but every transparent
material is wrong. It is undocumented in the support matrix until this spec (now cross-linked from
[render-backend-support.md](render-backend-support.md)).

### The GL reference to mirror

`drawGlScene` (`packages/scene-gl/src/drawGlScene.ts`) is **two-phased** (its own header comment, lines
47–59):

- **Pass 1 (opaque):** every subset whose material `alphaMode` is `opaque`/`mask` (and whose object
  `alpha` is 1), in scene-graph order, depth-write on, no blending.
- **Pass 2 (blended):** every subset whose material `alphaMode` is `blend` **or** whose object
  `alpha < 1`, sorted **back-to-front** by the mesh origin's clip-space W (a view-depth proxy computed as
  `vp[3]*wx + vp[7]*wy + vp[11]*wz + vp[15]`, `drawGlScene.ts:108–112`), with GL blending enabled
  (`SRC_ALPHA` / `ONE_MINUS_SRC_ALPHA`) for the pass and disabled after.

The partition is built into two pooled draw lists (`runtime.opaqueDrawList` / `blendedDrawList`) held on
`GlSceneRuntime`; blended entries carry `clipW` and `alpha` and sort via `compareBlendedEntriesDescending`
(descending W = farthest first). `isBlendedMaterial` duck-types `alphaMode === 'blend'` so any
`SurfaceMaterial` subtype routes to pass 2 without importing the concrete type.

### wgpu implementation

1. **Add a blended pipeline variant per material family.** WebGPU bakes blend state into the pipeline
   (immutable), so a family needs **two** compiled pipelines: the existing opaque one (no `blend`, depth
   write on) and a **blended** one with
   `fragment.targets[0].blend = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha',
   operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } }`
   and `depthStencil.depthWriteEnabled: false` (blended surfaces test depth but don't write it, so a
   later nearer transparent layer isn't rejected). Thread a `blended: boolean` through
   `createWgpuMeshPipeline`'s options (`wgpuMeshPipeline.ts:87`) and into the pipeline cache **key** —
   the key is already namespaced by `family:defineKey|format` (`ensureWgpuScenePipeline`,
   `wgpuMeshPipeline.ts:456`); append a `|blend` / `|opaque` segment so the two variants coexist. This is
   the bundle-invariant-respecting shape: two pipelines, not one pipeline with a runtime branch.

2. **Partition and sort in `drawWgpuScene`.** Mirror `drawGlScene` exactly: build `opaqueDrawList` /
   `blendedDrawList` on `WgpuSceneRuntime` (add the pooled draw-entry lists + pool, mirroring
   `glSceneRuntime.ts`), compute `clipW` per mesh from the same VP row-3 dot, resolve `objectAlpha` via
   `getSceneNodeWorldAlpha`, route `isBlendedMaterial(material) || objectAlpha < 1` to the blended list,
   and sort the blended list back-to-front (descending `clipW`) before drawing. `@flighthq/scene` and
   `@flighthq/render` already export everything needed (`getSceneNodeWorldAlpha`, `prepareSceneRender`);
   this is a pure translation.

3. **Bind the right pipeline per pass.** Pass 1 binds each family's opaque pipeline; pass 2 binds its
   blended pipeline. The bind→draw split (`renderer.bind` then `renderer.draw` reading
   `scene.activeMeshPipeline`) stays; the renderer's `bind` selects the opaque-vs-blended pipeline from a
   flag on the runtime (mirror `runtime.activeSkinnedRun` — add `runtime.activeBlendedRun`). Both passes
   run inside the one already-open scene render pass (WebGPU has no per-pass blend toggle; the pipeline
   carries it), so unlike GL there is no `gl.enable(BLEND)` / `gl.disable(BLEND)` bracket — the pipeline
   swap **is** the bracket.

4. **Emitters last.** Keep the trailing `drawWgpuSceneParticleEmitters` call — it already draws as a
   final transparent instanced pass, matching GL.

### Verification

`.webgpu.ts` baseline for a scene with an opaque mesh behind a `blend`-alphaMode mesh (a translucent
quad over a solid box). Today it captures the mesh opaque; after the fix it captures the backdrop showing
through. Also add a two-transparent-layer scene to exercise the sort.

---

## 2. Orthographic projection renders blank on wgpu

**Implemented.** `writeWgpuFrameUniform` remaps the camera VP from GL `[-1,1]` depth to WebGPU `[0,1]`
depth at the backend seam. `camera-orthographic.webgpu.ts` is the raster proof; shadow-map WGSL retains
its existing independent light-space remap and is not corrected twice.

### The gap

An orthographic camera renders **blank** on wgpu while perspective is fine
([render-backend-support.md](render-backend-support.md) gap #6; `camera-orthographic` functional test is
scoped gl-only). Root cause: **NDC-Z range mismatch.** WebGPU clip space is z ∈ `[0, 1]`; WebGL2 is
z ∈ `[-1, 1]`. The ortho projection matrix from `@flighthq/camera` is built for the GL `[-1, 1]`
convention, so on wgpu every ortho-projected fragment lands outside the `[0, 1]` depth range and is
clipped. Perspective happens to survive because its projected scenes fall in-range for the test content,
but ortho does not.

### wgpu implementation

The fix is a **clip-space Z remap at the wgpu seam**, not a change to `@flighthq/camera` (which stays the
math-layer GL-convention source of truth — changing it would break GL). Options, preferred first:

1. **Remap in `writeWgpuFrameUniform`.** After `getCameraViewProjectionMatrix4` composes the VP matrix
   (`wgpuMeshPipeline.ts:697`), left-multiply the standard GL→WebGPU depth-correction matrix
   `Zfix = diag(1,1,0.5,1)` with row-3 translate `+0.5` (i.e. maps `z_ndc' = z_ndc*0.5 + 0.5*w`) before
   writing it into the Frame uniform. This corrects **both** ortho and perspective uniformly and is the
   canonical WebGPU port fix. It is a single matrix premultiply per frame, no per-vertex cost.
2. Alternatively, apply `Zfix` in the shared `vs_main` (`WGPU_MESH_PRELUDE_WGSL`,
   `wgpuMeshPipeline.ts:790`) after `frame.viewProjection * world`. This keeps the CPU VP identical to GL
   but adds a per-vertex op; option 1 is preferred (one matrix mul beats N vertex muls, per the bundle
   rule that feature-cost belongs at the coarsest correct granularity).

Ensure the depth-correction is applied to the **same** VP the shadow-map and any depth-consuming pass
use, so shadow projection and scene projection stay in one Z convention. `wgpuMeshPipeline`'s shadow
uniform (`ensureWgpuShadowSampleBindGroup`) already carries its own light matrix — that matrix, if it
projects into sample space, needs the same remap.

### Verification

Un-scope `camera-orthographic` to gl+wgpu and capture a `.webgpu.ts` baseline. The scene that is blank
today should match the gl baseline (within the software-AA tolerance).

---

## 3. WebGPU GPU skinning (zero today, across every material)

### The gap

`scene-wgpu` has **no GPU skinning of any kind** — grep confirms no `joint`/`skin`/palette handling in
any mesh renderer or prelude. A skinned mesh (glTF/MD5/AWD with `JOINTS_0`/`WEIGHTS_0`) renders in **bind
pose** on wgpu unless the app runs the CPU `updateMeshSkin` (`@flighthq/skeleton3d`) every frame. No
warning fires.

### The GL reference to mirror

GL shipped **HAS_SKIN across all five real mesh families** — classic, PBR, toon, unlit, and
ShadedMaterial (grep: `glClassicPrelude.ts`, `glPbrProgramCache.ts`, `glToonPrelude.ts`,
`glUnlitPrelude.ts`, `glShadedPrelude.ts` all carry the HAS_SKIN define; matcap/debug/wireframe do not).
The shipped mechanism is a **bone-palette RGBA32F data texture** read with `texelFetch` — the carrier the
original design decision named — one mat4 packed as four consecutive texels:

```glsl
uniform highp sampler2D u_jointTexture;   // glMeshProgram.ts (GL_SKIN_VERTEX_DECLARATIONS_GLSL)
// fetchJointMatrix(j) = mat4(texelFetch(u_jointTexture, ivec2(j*4 + c, 0), 0) for c in 0..3)
skinMatrix = w.x*fetchJointMatrix(int(j.x)) + w.y*fetchJointMatrix(int(j.y)) + …
```

The palette texture is per-state (`GlSceneRuntime.skinPalette`, a `GlSkinPaletteTexture` created lazily by
`ensureGlSkinPalette` and grown to the largest skeleton seen), uploaded per draw by
`uploadGlSkinPaletteTexture` (`@flighthq/render-gl`) into an RGBA32F single-row texture on the
`SKIN_PALETTE_TEXTURE_UNIT` (12). Because the palette is a **texture read with texelFetch (GLSL ES 3.0
core — no float-filter extension)**, the joint count is bounded by `MAX_TEXTURE_SIZE` (thousands of
joints), so there is **no per-context uniform-budget capacity cap and no CPU-skinning fallback** — the old
`getGlSkinJointCapacity` + `isGpuSkinnedDraw` capacity gate is gone. `drawGlScene`'s `isGpuSkinnedDraw`
gate (`drawGlScene.ts`) now GPU-skins whenever the mesh carries a skin and its geometry has
`joints0`/`weights0`. A skinned run selects the HAS_SKIN program variant and splits the bind run on
`skinned`; the palette pointer flows through `SceneRenderProxy.jointMatrices` (`drawGlMeshSubset` uploads
it into `u_jointTexture`). The CPU kernel in `@flighthq/skeleton3d` (`skinVertices` / `skinMeshGeometry` /
`updateMeshSkin`) is retained **only for bounds/picking**, not as a draw fallback.

### wgpu implementation

Mirror the GL path, using the bone-palette **data texture** carrier the LOCKED decision names (a
`texture_2d<f32>` sampled by `textureLoad(jointTexture, vec2(j*4 + c, 0), 0)` — the WGSL analog of GL's
`texelFetch`):

1. **Palette as an RGBA32F data texture.** Upload the joint palette into a single-row `rgba32float`
   texture (one mat4 = four texels), the wgpu mirror of `GlSkinPaletteTexture` / `uploadGlSkinPaletteTexture`.
   Bind it in the skin bind group (fold into the Draw group bound only for skinned pipelines, respecting
   the `maxBindGroups=4` floor). `textureLoad` needs no sampler and no float-filterable feature, so the
   joint count is bounded by `maxTextureDimension1D`/`2D` rather than a uniform/storage-buffer size — the
   same MAX_TEXTURE_SIZE reach as GL, and no capacity cap.
2. **HAS_SKIN pipeline variant per family.** Each family compiles a skinned pipeline permutation (extra
   vertex attributes `joints0` (uint) + `weights0` (float), an extended `VERTEX_BUFFER_LAYOUTS`, and the
   skin bind group in the layout). Key the variant into the pipeline cache the same way item 1's
   `|blend`/`|opaque` does — append `|skin` so skinned and rigid pipelines of the same family coexist and
   the rigid draw pays nothing.
3. **No capacity gate, no CPU fallback.** GL dropped both when it moved to the data texture; wgpu matches —
   `isWgpuGpuSkinnedDraw` GPU-skins whenever the mesh carries a skin and its geometry has
   `joints0`/`weights0` (mirror `isGpuSkinnedDraw`). Wire `activeSkinnedRun` on `WgpuSceneRuntime` and
   split the bind run on `skinned` exactly as `drawGlScene` does.
4. **Skinned bounds for cull/pick** are a `@flighthq/skeleton3d` CPU-kernel concern shared with GL (not
   wgpu-specific): the conservative joint-swept AABB (default) and exact-CPU-skinned bounds option. wgpu
   consumes whatever the shared kernel produces; no wgpu-specific bounds code.

### Verification

`.webgpu.ts` baseline for a skinned mesh posed away from bind pose (the same scene GL should get). The
deformed silhouette must match the GL capture. A large-skeleton scene (e.g. an MD5/AWD rig well past 64
joints) verifies the no-cap data-texture path renders rather than falling back.

---

## 4. ShadedMaterial on wgpu (modifier-stack material tier)

### The gap

The new `@flighthq/shading` modifier tier (fresnel / normalPerturb / emissive / envReflect-skybox /
fog / vertexDisplace / dissolve / toon, composed into a `ShadedMaterial` modifier stack) has a **gl
renderer only** (`glShadedPrelude.ts` + `shadedGlMeshMaterialRenderer` in `scene-gl`). `scene-wgpu` has
**no ShadedMaterial renderer** — a `ShadedMaterial` resolves to no wgpu mesh-material renderer and its
subset is **skipped** (`drawWgpuScene.ts:54`, `if (renderer === null) continue`). The mesh silently
disappears (that subset draws nothing), not even bind-pose-wrong.

### The GL reference to mirror

`glShadedPrelude.ts` composes the modifier stack into one GLSL program: each modifier contributes a WGSL/
GLSL snippet and a uniform block, spliced into shared vertex (`vertexDisplace`) and fragment
(fresnel/emissive/envReflect/fog/dissolve/toon/normalPerturb) insertion points, with the define-key
namespacing the compiled variant per active modifier set. The `shadedGlMeshMaterialRenderer` binds the
per-modifier uniforms and any modifier maps (env cube for envReflect, dissolve map). Critically, GL also
**fixed the previously-disabled normal map** here (flight-reference `basic-shading` "DIAG: normal map
temporarily disabled") — the normalPerturb modifier is the home of working tangent-space normal mapping.

### wgpu implementation

1. **Port the modifier→WGSL splice.** Build `wgpuShadedPrelude.ts` mirroring `glShadedPrelude.ts`: each
   modifier emits a WGSL snippet + a uniform-struct fragment; splice into the shared `WGPU_MESH_PRELUDE`
   vertex (`vertexDisplace`) and a shaded `fs_main` (the fragment modifiers). Namespace the pipeline-cache
   key by the active-modifier define-key exactly as GL does, so each modifier combination compiles once.
2. **`shadedWgpuMeshMaterialRenderer`** registers under the ShadedMaterial kind, binds the composed
   material uniform block + modifier maps (env cube, dissolve map) into a group(2) material bind group,
   and reuses the shared Frame/Draw groups. Register it via the same `registerWgpu*MeshMaterials` opt-in
   surface the other families use.
3. **Normal map must work here too.** Port the fixed tangent-space normalPerturb from GL — do not carry
   the disabled diagnostic forward. The `VERTEX_BUFFER_LAYOUTS` already ships tangent
   (`float32x4` @24, `wgpuMeshPipeline.ts:882`) and `VertexOutput.worldTangent` is already plumbed
   (`wgpuMeshPipeline.ts:786`), so the tangent frame the perturb needs is present.
4. **Compose cleanly with skin/morph/blend.** ShadedMaterial's pipeline permutation must combine with the
   item-3 skin variant and item-1 blend variant in the cache key (`shaded:<mods>|<format>|skin|blend`),
   so a skinned, blended, shaded mesh is one coherent compiled pipeline — the same combinatorial-key
   approach GL uses.

### Verification

`.webgpu.ts` baseline for the `shading-globe` (and a normal-mapped `basic-shading`) scene, matching the
gl capture. The normal-map scene is the regression guard against re-disabling it.

---

## 5. Advanced blend modes as wgpu composite-recipe effects

### The gap

The advanced / destination-reading / non-separable blend modes (Overlay, HardLight, SoftLight,
Difference, Exclusion, ColorDodge, ColorBurn, Hue, Saturation, Color, Luminosity) are — per the locked
design decision — **not** in the fixed-function `BlendMode` enum. They are a **separate
`AdvancedBlendMode` vocabulary realized as composite-recipe effects**: `@flighthq/effects`
`createBlendEffect` (+ `blendModeMath`) with a gl runner `@flighthq/effects-gl` `glBlendEffect` /
`applyBlendEffectToGl` (an offscreen composite pass sampling the layer + a registered backdrop). There is
**no `effects-wgpu` blend runner** (grep: `effects-wgpu/src` has no `blend` file). On wgpu, an advanced
blend has no realization — it does not composite. Canvas/DOM realize the same set natively via
`globalCompositeOperation` / CSS `mix-blend-mode`.

This is the **anti-footgun** design: advanced modes are explicit effects with visible cost, never a
silent `node.blendMode = Overlay` that would degrade to Normal on GPU. The wgpu gap is a **missing
realization of an explicit effect**, not a silent-degrade — but it is still a parity hole (the effect
no-ops on wgpu).

### The GL reference to mirror

`@flighthq/effects-gl` `glBlendEffect.ts`: an offscreen composite pass whose fragment shader samples the
source layer and a **backdrop** texture (registered with `registerGlBlendEffectBackdrop`) and applies the
GLSL port of `@flighthq/effects` `blendModeMath` (the separable formulas + the HSL non-separable set —
Hue/Saturation/Color/Luminosity via the standard `setLum`/`setSat` construction). The mode is data on the
`BlendEffect` descriptor; the shader branches on it (or, better for bundle size, compiles a per-mode
variant — check which `glBlendEffect` actually does and mirror it).

### wgpu implementation

1. **`wgpuBlendEffect.ts`** in `@flighthq/effects-wgpu`, mirroring `glBlendEffect.ts`: a fullscreen
   composite pass (reuse render-wgpu's fullscreen-pass plumbing) sampling the layer + a backdrop bound via
   a `registerWgpuBlendEffectBackdrop` seam (the wgpu twin of the gl backdrop registrar), with a WGSL port
   of `blendModeMath`. The `@flighthq/effects` descriptor + math are backend-agnostic and already exist;
   this is a WGSL translation of the gl runner only.
2. **Backdrop capture.** The gl runner samples a registered backdrop texture; wgpu needs the equivalent —
   the composited-so-far color target bound as a sampled texture for the pass. render-wgpu's target pool
   already supports sampling a prior target (the effect pipeline chains passes through offscreen targets);
   bind the backdrop target's view into the blend pass's material group.
3. **Per-mode variant vs branch.** Match whatever `glBlendEffect` chose (per-mode pipeline variant keyed
   in the wgpu pipeline cache is preferred for the bundle invariant — an unused mode shouldn't tax the
   others). The HSL non-separable modes need the `setLum`/`setSat` WGSL helpers; port them from the GLSL.

### Verification

`.webgpu.ts` baseline for the advanced-blend scene(s) the gl runner covers (Multiply/Screen/Overlay over
a backdrop), matching the gl capture.

---

## 6. Directional shadow depth pass is unrunnable (produces an invalid command buffer)

### The gap

`drawWgpuSceneShadowMap` exists and its shadow-sample bind group is wired into every lit family (PBR today,
classic/toon after the shadow-reception change), but **the depth pass has never run in a real frame** — no
functional scene exercised it, and the unit tests use a fake device that does not enforce WebGPU's
render-pass validation. Running it (the `shadow-classic` scene, first attempt) fails at submit:

```
Recording in [CommandEncoder] which is locked while [RenderPassEncoder] is open.
 - While encoding [CommandEncoder].BeginRenderPass(...)
[Invalid CommandBuffer] is invalid due to a previous error — While calling [Queue].Submit(...)
```

Root cause: `renderWgpuBackground` (`render-wgpu/src/wgpuBackground.ts`) **creates the command encoder and
opens the main color/background render pass in the same call**, leaving that pass open. `drawWgpuSceneShadowMap`
calls `encoder.beginRenderPass(...)` for its depth pass, but its own contract — "called before the main scene
render pass opens; no-op if no command encoder is active" — is **impossible to satisfy**: the only thing that
creates the encoder also opens a pass, so there is no window where the encoder exists with no pass open. The
frame renders blank (coverage 0). This blocks shadows for *all* lit families on wgpu, not just classic/toon.

### The fix (render-wgpu frame-API change — a design decision, not a scene fix)

Split encoder creation from the background pass so a caller can insert the depth pass between them. Options:
1. A `beginWgpuFrame(state)` that creates the encoder (and resets frame state) without opening the background
   pass; `renderWgpuBackground` then only opens/clears the color pass. Scene order becomes
   `beginWgpuFrame → drawWgpuSceneShadowMap → renderWgpuBackground → begin…RenderEffectPipeline → …`.
2. Or have `drawWgpuSceneShadowMap` record its depth pass on its **own** encoder submitted before the frame
   encoder (it already owns a dedicated depth target), decoupling it from the background-pass lifecycle.

Mirror gl's proven order (shadow → background/pipeline → prepare → draw). gl works because `drawGlSceneShadowMap`
binds its own FBO and there is no "one open pass locks the encoder" rule.

### Verification

Un-scope `shadow-classic` (and eventually a PBR shadow scene) to `+wgpu` and capture a `.webgpu.ts` baseline
matching the gl capture (a Blinn-Phong sphere casting a dark shadow onto the plane it receives onto). Until
then `shadow-classic` is webgl-only and the AGENTS.md feature table lists shadows as gl-only.

---

## Sequencing

Do them in bite order (worst-first), each with its `.webgpu.ts` capture before moving on:

1. **Transparent-pass two-phase (item 1)** — the only *wrong-output* item; everything transparent is
   broken today. Also the prerequisite shape (pooled draw lists + pipeline-cache variant keying) that
   items 3–5 extend.
2. **Ortho remap (item 2)** — a one-matrix fix that unblocks a whole camera mode (black screen today).
3. **GPU skinning (item 3)** — the largest, but the pipeline-variant + capacity-gate + CPU-fallback
   scaffolding from items 1–2 carries most of it; the CPU kernel and bounds are already shared in
   `@flighthq/skeleton3d`.
4. **ShadedMaterial (item 4)** and **advanced-blend effects (item 5)** — independent of each other; both
   reuse the pipeline-cache variant keying and the effects/material seams the GL side already defined.

Every item is a **translation of a shipped GL file**, not a new design. When one lands, un-scope its
functional test to gl+wgpu, capture the `.webgpu.ts` baseline, update
[render-backend-support.md](render-backend-support.md) and [maturity-gaps.md](maturity-gaps.md), and mark
it done here.
