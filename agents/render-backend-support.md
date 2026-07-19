# Render Backend Feature Support (current state)

What actually renders on each backend **today**, and the known deltas from the target in [render-architecture.md](render-architecture.md) (which describes the intended end state — e.g. it claims "WebGPU and WebGL2 carry 3D with full parity" and lists Point/Spot lights; several of those are not yet wired). Read this before assuming a feature works on a backend, before scoping a functional test's `renderers`, or before "fixing" a test that fails only on one backend — the failure may be a real renderer gap, not the test.

Findings are empirical (surfaced building the per-primitive functional suite, 2026-06-23) and file-cited. Backends: **canvas** / **dom** are web-only 2D; **gl** / **wgpu** are 2D + 3D. Each capability below is an opt-in where noted (`enable*…Support(state)` / a `register*` call) — absent the opt-in the feature no-ops.

## 2D capability matrix

| Feature | canvas | dom | gl | wgpu | Notes / source |
| --- | --- | --- | --- | --- | --- |
| Per-node `alpha` | ✓ | ✓ | ✓ | ✓ | `HasAppearance.alpha` |
| Per-node `visible` | ✓ | ✓ | ✓ | ✓ | inherits to subtree |
| 2D transform (pos/rot/scale/pivot) | ✓ | ✓ | ✓ | ✓ | `rotation` is **degrees** (`node/transform2d.ts`) |
| Blend modes — fixed-function set (Add/Darken/Erase/Lighten/Multiply/Screen/Subtract) | ✓ | ✓ | ✓ | ✓ | the `BlendMode` node property; gl + wgpu realize these; see gap #1 |
| Advanced blend — the `BlendEffect` composite recipe (Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) | ✓ | ✓ | ✓ | ✗ | NOT a node property — an explicit `AdvancedBlendMode` effect (`@flighthq/effects` `createBlendEffect` + `@flighthq/effects-gl` `applyBlendEffectToGl` over a registered backdrop). Canvas/DOM realize the same set natively via `globalCompositeOperation`/`mix-blend-mode`; gl = the composite pass; wgpu = spec-only (gap #1) |
| Blend mode `None` (no-blend / source overwrite) | ~ | ~ | ✓ | ✓ | gl/wgpu overwrite (ONE,ZERO); canvas/dom have no per-node equivalent → Normal (identical for opaque) |
| Clip (rect + contour) | ✓ | ✓ | ✓ | ✓ | opt-in `enable*ClipSupport` |
| Render cache (`cacheAsBitmap`) | ✓ | ~ | ✓ | ~ | opt-in `enable*RenderCache`; bake reachable outside the frame loop only on canvas/gl (dom/wgpu bake in-frame) |
| Stroke caps (none/round/square) | ✓ | ✓ | ✓ | ✓ |  |
| Stroke joins (miter/bevel/round) | ✓ | ✓ | ✗ | ✗ | see gap #2 |
| Shape solid / gradient / bitmap fill | ✓ | ✓ | ✓ | ✓ | bitmap fill tiles from shape-local origin (0,0), not the rect corner |
| Per-**bitmap** `smoothing` flag | ✓ | ✓ | ✗ | ✗ | see gap #3 |
| Per-**instance** ColorTransform tint (quad/tile/node `materialData`) | ✗ | ✗ | ✓ | ✓ | see gap #4; canvas/dom apply node-level material only |
| Text underline | ✓ | ✓ | ✓ | ✓ |  |
| Text strikethrough | ✓ | ✓ | ✗ | ✗ | see gap #5 |
| Text background / border box | ✓ | ✓ | ✓ | ✓ |  |
| Text alignment (center/right) | ✓ | ✓ | ✓ | ✓ | single-line and multiline both render (gap #7 fixed) |
| Sprite / QuadBatch / Tilemap | ✓ | ✗ | ✓ | ✓ | no DOM renderer for the atlas-batch primitives |
| Scale9 (nine-slice) | ✓ | ✓ | ✓ | ✓ | dom needed a barrel fix (now exported) |
| Video (display object) | ✓ | ✓ | ✓ | ✓ |  |
| Video **texture** (dynamic, per-frame GL upload) | ✗ | ✗ | ✓ | ✗ | `@flighthq/texture` `VideoTexture` + `render-gl` `uploadGlTextureVideoFrame` (frameId-gated element upload). Scene texture + 2D bitmap fill. **gl-only** — no wgpu / canvas / dom per-frame upload path (canvas/dom draw the `<video>` element directly, not a `VideoTexture`) |
| Compressed textures (BCn/ETC/ASTC/PVRTC/ATF native upload) | ✗ | ✗ | ✓ | ✗ | `render-gl` `uploadGlCompressedTextureContainer` over `WEBGL_compressed_texture_*` + `detectGlCompressedTextureSupport` capability detect + RGBA decode fallback seam. **gl-only** — no wgpu compressed upload; Basis-Universal transcode spec-only ([basis-transcode.md](basis-transcode.md)) |

## 3D capability matrix (gl / wgpu only — canvas/dom are 2D)

| Feature | gl | wgpu | Notes / source |
| --- | --- | --- | --- |
| Mesh geometry (box/sphere/plane/cone/cylinder/…) | ✓ | ✓ | unlit + the 20-material taxonomy |
| Mesh transform (`mesh.localMatrix`) + parent-hierarchy composition | ✓ | ✓ | `node/transform3d.ts` world = parent×local |
| Depth occlusion | ✓ | ✓ | depth-stencil in the effect pipeline |
| Perspective projection | ✓ | ✓ |  |
| Orthographic projection | ✓ | ✗ | see gap #6 — **blank on wgpu** |
| Ambient + Directional lights | ✓ | ✓ |  |
| Point / Spot / Hemisphere lights | ✓ | ✓ | forward punctual lighting wired on both gl and wgpu |
| Transparent (blend-alphaMode / faded) meshes composite correctly | ✓ | ✗ | see gap #11 — **wgpu draws every mesh opaque** (single-pass, no blend state, no back-to-front sort). gl is two-phased (`drawGlScene.ts`) |
| GPU skeletal skinning | ✓ | ✗ | **gl** = `HAS_SKIN` across classic/pbr/toon/unlit/shaded (bone-palette RGBA32F **data texture** read via `texelFetch`; joint count bounded by MAX_TEXTURE_SIZE — no uniform-budget cap, no CPU fallback). **wgpu** = none — bind pose. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3 |
| Morph / blend-shape deformation | ✓ | ✗ | **gl** CPU-blend-then-upload (glTF/MD2 import). **wgpu** = none. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) |
| ShadedMaterial modifier stack (fresnel/normalPerturb/emissive/envReflect/fog/vertexDisplace/dissolve/toon) | ✓ | ✗ | **gl** `shadedGlMeshMaterialRenderer` (+ working tangent-space normal map). **wgpu** = no ShadedMaterial renderer → subset skipped (draws nothing). [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §4 |

## Known gaps (renderer not at parity — scope tests, don't fight them)

1. **Advanced blend is a `BlendEffect` composite recipe, not a node property — and wgpu is spec-only.** The `BlendMode` node enum (`packages/types/src/BlendMode.ts`) is now **fixed-function only** — `Add`, `Darken` (MIN), `Erase`, `Lighten` (MAX), `Multiply`, `Screen`, `Subtract`, plus `Normal`/`Layer`/`None`/`Invert`/`Alpha`/`Shader`. **gl** (`DEFAULT_GL_BLEND_MODES` in `packages/render-gl/src/glDraw.ts`) and **wgpu** (`BLEND_MODES` in `packages/render-wgpu/src/wgpuShader.ts`) realize that set as fixed-function blend state. The destination-reading / non-separable **advanced** modes (`AdvancedBlendMode` — Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) were **removed from the enum** so assigning one as a node property can no longer silently fall back to Normal. They are applied explicitly as a `BlendEffect` (`@flighthq/effects` `createBlendEffect`) realized on **gl** by `applyBlendEffectToGl` (`@flighthq/effects-gl`) — an offscreen composite pass sampling the layer + a backdrop registered with `registerGlBlendEffectBackdrop`, GLSL mirroring `@flighthq/effects` `blendModeMath`. Canvas/DOM realize the same `AdvancedBlendMode` set natively (`globalCompositeOperation` / CSS `mix-blend-mode`) in `canvasMaterials`/`domMaterials`. **wgpu has no `BlendEffect` runner yet — spec-only.** Caveat on the fixed-function set: `Darken`/`Lighten` (MIN/MAX) can't fold in the `(1-src.a)` term, so a transparent surround darkens/limits the backdrop at edges the way premultiplied `Multiply` no longer does. Tests: `node-blend-modes` (canvas/dom/webgl, asserts Add) + `node-blend-modes-advanced` (canvas/dom, Multiply/Screen).
2. **Stroke join styles not differentiated on gl/wgpu.** The GL shape-stroke tessellation has no miter/bevel/round join handling (caps DO work). Test `shape-stroke-joints` scoped to canvas/dom.
3. **Per-bitmap `smoothing` ignored on gl/wgpu.** `bindGlTexture` (`packages/render-gl/src/glDraw.ts`) sets the texture min/mag filter from the **global** `state.allowSmoothing`, not the per-bitmap flag (and the texture is element-keyed cached, so the first draw's filter sticks). Test `bitmap-downscale-smoothing` scoped to canvas/dom.
4. **Per-instance ColorTransform tint is gl/wgpu only.** Only `registerGlColorTransformMaterial` / `registerWgpuColorTransformMaterials` exist; Canvas/DOM bitmap renderers have no color-transform material renderer, so a `materialData` ColorTransform draws untinted there. (`bitmap-color-transform` sidesteps this by tinting source pixels via `applySurfaceColorTransform`, which is cross-backend.)
5. **Text strikethrough not drawn on gl/wgpu** (the gl/wgpu RichText renderers handle `underline` but not `strikethrough`). Test `text-strikethrough` scoped to canvas/dom.
6. **Orthographic projection renders blank on wgpu** (perspective is fine). Almost certainly a clip-space z-range issue — WebGPU NDC z is `[0,1]` vs WebGL `[-1,1]`, and the ortho matrix is not remapped for it. Test `camera-orthographic` scoped to gl (its `render.webgpu.ts` removed).
7. **~~Single-line RichText alignment renders nothing.~~ FIXED.** The gl/canvas RichText renderers passed a `10000` wrap-prevention sentinel as the layout width when `wordWrap` was false, so `applyAlignment` (`textLayout.ts`) centered the line against 10000 and shifted it ~4975px off-screen. Both renderers now pass `data.width` unconditionally (wrapping stays `wordWrap`-gated inside `computeTextLayout`), so single-line `align:'center'/'right'` renders correctly. (Number retained to keep gap #8–#10 references stable.)

## Feature gaps (not implemented at all — implement before testing)

8. **~~Punctual lights — wired on gl, not wgpu.~~ DONE.** Forward punctual lighting (point/spot/hemisphere) now shades on **both gl and wgpu**: `SceneLights` (`packages/types/src/SceneLights.ts`) carries `point`/`spot`/`hemisphere` arrays alongside `ambient`/`directional`, `packSceneLightBlock` (`packages/render/src/sceneRender.ts`) packs up to `MAX_FORWARD_LIGHTS` (= 4) of each type into the `SceneLightBlock`, and both backends consume them — gl via `u_pointLights`/`u_spotLights`/`u_hemisphereLights` uniform arrays (`GL_MESH_LIGHT_BLOCK_GLSL` in `packages/scene-gl/src/glLitProgram.ts`), wgpu via the expanded Frame struct's `pointLights`/`spotLights`/`hemisphereLights` arrays (`wgpuPbrPrelude.ts`). Both share the `shadePbrPunctual` factored BRDF (Cook-Torrance + extension lobes), `rangeWindow` inverse-square falloff, and cone smoothstep for spots. Area lights remain deferred (no `SceneLights.area` field).
9. **Group/layer blend.** A `blendMode` on a container (so the whole subtree composites as one layer) needs render-to-texture flattening; unverified whether the renderer does this. Treat as a gap until confirmed.
10. **TextureAtlasRegion pivot.** `pivotX/pivotY` on an atlas region are reported (audit, unverified) as stored but never read by the sprite renderers.
11. **wgpu 3D transparent pass silently draws opaque.** `drawWgpuScene` (`packages/scene-wgpu/src/drawWgpuScene.ts`) is single-pass in scene-graph order; the mesh pipelines carry **no blend state** (`fragment.targets` has no `blend`, `wgpuMeshPipeline.ts:119`) and there is **no opaque/blend partition and no back-to-front sort**. So a `blend`-alphaMode material or a faded (`alpha < 1`) mesh composites with no alpha blending — it writes opaque pixels + depth and occludes what's behind it. This is SURPRISE-class (renders, not blank, but every transparent material is wrong) and was undocumented until now. gl is two-phased for exactly this (`drawGlScene.ts:47–59`: opaque pass then back-to-front-sorted blended pass with `SRC_ALPHA`/`ONE_MINUS_SRC_ALPHA`). The un-postpone plan is [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §1.

When you close one of these, update this table and un-scope the corresponding functional test's `renderers`.

## Related docs

- [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) — the implementation plan to un-postpone WebGPU 3D parity (transparent pass, ortho remap, GPU skinning, ShadedMaterial, advanced-blend effects) — every wgpu ✗ in the 3D matrix above.
- [render-architecture.md](render-architecture.md) — the **target** render/scene architecture (this doc is the current delta from it).
- [`functional-test` skill](../.claude/skills/functional-test/SKILL.md) — authoring a visual test; scope backends via `"renderers": [...]` in the test's `package.json`.
