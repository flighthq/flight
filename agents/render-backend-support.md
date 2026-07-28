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
| Advanced blend — the `BlendEffect` composite recipe (Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) | ✓ | ✓ | ✓ | ✓ | NOT a node property — an explicit `AdvancedBlendMode` effect (`@flighthq/effects` `createBlendEffect`) over a registered backdrop. Canvas/DOM realize the set natively via `globalCompositeOperation`/`mix-blend-mode`; gl/wgpu use matching offscreen composite passes (`applyBlendEffectToGl` / `applyBlendEffectToWgpu`). `effect-blend-advanced` verifies exact gl/wgpu pixels. |
| Blend mode `None` (no-blend / source overwrite) | ~ | ~ | ✓ | ✓ | gl/wgpu overwrite (ONE,ZERO); canvas/dom have no per-node equivalent → Normal (identical for opaque) |
| Clip (rect + contour) | ✓ | ✓ | ✓ | ✓ | opt-in `enable*ClipSupport` |
| Render cache (`cacheAsBitmap`) | ✓ | ~ | ✓ | ~ | opt-in `enable*RenderCache`; bake reachable outside the frame loop only on canvas/gl (dom/wgpu bake in-frame) |
| Stroke caps (none/round/square) | ✓ | ✓ | ✓ | ✓ |  |
| Stroke joins (miter/bevel/round) | ✓ | ✓ | ✓ | ✓ | gl + wgpu tessellate stroke-only outlines; closed (ring) strokes still raster — see gap #2 |
| Shape solid / gradient / bitmap fill | ✓ | ✓ | ✓ | ✓ | bitmap fill tiles from shape-local origin (0,0), not the rect corner |
| Per-**Sprite** sampler filter | ✓ | ✓ | ✓ | ✓ | `Texture.sampler` owns linear/nearest filtering across every backend — see gap #3 |
| Per-**instance** ColorTransform tint (quad/tile/node `materialData`) | ✗ | ✗ | ✓ | ✓ | see gap #4; canvas/dom apply node-level material only |
| Text underline | ✓ | ✓ | ✓ | ✓ |  |
| Text strikethrough | ✓ | ✓ | ✓ | ✓ | all backends; gl/wgpu draw it through their canvas-raster RichText path (gap #5 fixed) |
| Text background / border box | ✓ | ✓ | ✓ | ✓ |  |
| Text alignment (center/right) | ✓ | ✓ | ✓ | ✓ | single-line and multiline both render (gap #7 fixed) |
| Sprite | ✓ | ✓ | ✓ | ✓ | one textured quad; image/video/produced backings share the node |
| QuadBatch / Tilemap | ✓ | ✗ | ✓ | ✓ | no DOM renderer for the multi-quad atlas primitives |
| Scale9 (nine-slice) | ✓ | ✓ | ✓ | ✓ | dom needed a barrel fix (now exported) |
| Video-backed Texture | ✓ | ✓ | ✓ | ✓ | `Sprite` displays the same video-backed `Texture` on every backend; GL/WebGPU use version-gated uploads, Canvas draws the current frame, and DOM mounts the actual video element. Materials consume the same texture slot. |
| Compressed textures (BCn/ETC/ASTC/PVRTC/ATF native upload) | ✗ | ✗ | ✓ | ✓ | GL and WebGPU both expose opt-in container upload + RGBA decoder seams and their normal 2D `ImageResource` binders consume compressed-only resources once registered. WebGPU enables the adapter's BC/ETC2/ASTC device features and uploads those families natively; PVRTC and unavailable families decode to RGBA. Native low-level upload covers 2D, cubemap, and 2D array; the display binder and decode fallback are 2D. `compressed-texture` proves exact GL/WebGPU raster parity. Basis-Universal transcode remains spec-only ([basis-transcode.md](basis-transcode.md)). |

## 3D capability matrix (gl / wgpu only — canvas/dom are 2D)

| Feature | gl | wgpu | Notes / source |
| --- | --- | --- | --- |
| Mesh geometry (box/sphere/plane/cone/cylinder/…) | ✓ | ✓ | unlit + the 20-material taxonomy |
| Mesh transform (`mesh.localMatrix`) + parent-hierarchy composition | ✓ | ✓ | `node/transform3d.ts` world = parent×local |
| Depth occlusion | ✓ | ✓ | depth-stencil in the effect pipeline |
| Perspective projection | ✓ | ✓ |  |
| Orthographic projection | ✓ | ✓ | wgpu remaps the GL-convention VP into `[0,1]` NDC-Z in `writeWgpuFrameUniform`; `camera-orthographic` covers both backends |
| Ambient + Directional lights | ✓ | ✓ |  |
| Point / Spot / Hemisphere lights | ✓ | ✓ | forward punctual lighting wired on both gl and wgpu |
| Directional shadow map (PBR + classic receivers) | ✓ | ✓ | one orthographic light-depth pass with PCF reception; WebGPU records `beginWgpuFrame` → shadow depth → forward pass on one encoder. `shadow-directional` and `shadow-classic` carry real raster proofs. |
| Transparent (blend-alphaMode / faded) meshes composite correctly | ✓ | ✓ | both backends partition opaque/blended subsets and sort the blended pass back-to-front; wgpu uses immutable `|opaque` / `|blend` pipelines |
| GPU skeletal skinning | ✓ | ✓ | `HAS_SKIN` across classic/pbr/toon/unlit/shaded on both backends; a growable single-row RGBA32F palette is read with `texelFetch` (gl) / `textureLoad` (wgpu). WebGPU enables the tree-shakeable permutation with `registerWgpuGpuSkinning(state)`. No uniform-budget cap or CPU draw fallback; `scene-skinning` verifies a posed 80-joint WebGPU rig. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3 |
| Morph / blend-shape deformation | ✓ | ✓ | Both backends consume `prepareSceneMorph`'s CPU-blended, versioned geometry upload (glTF/MD2 import). WebGPU also composes the current morphed vertices with GPU skinning rather than freezing the skin bind-pose upload. `scene-morph` and `scene-skin-morph-compose` cover the standalone and composed paths. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) |
| ShadedMaterial modifier stack (fresnel/normalPerturb/emissive/envReflect/fog/vertexDisplace/dissolve/toon) | ✓ | ✓ | `shadedGlMeshMaterialRenderer` / `shadedWgpuMeshMaterialRenderer`; both compose ordered modifier variants and support tangent-space normal maps. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §4 |

## Known gaps (renderer not at parity — scope tests, don't fight them)

1. **~~Advanced blend was a `BlendEffect` composite recipe without a wgpu realization.~~ RESOLVED.** The `BlendMode` node enum (`packages/types/src/BlendMode.ts`) is **fixed-function only** — `Add`, `Darken` (MIN), `Erase`, `Lighten` (MAX), `Multiply`, `Screen`, `Subtract`, plus `Normal`/`Layer`/`None`/`Invert`/`Alpha`/`Shader`. **gl** (`DEFAULT_GL_BLEND_MODES` in `packages/render-gl/src/glDraw.ts`) and **wgpu** (`BLEND_MODES` in `packages/render-wgpu/src/wgpuShader.ts`) realize that set as fixed-function blend state. The destination-reading / non-separable **advanced** modes (`AdvancedBlendMode` — Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity) are explicit `BlendEffect` recipes (`@flighthq/effects` `createBlendEffect`), so assigning one as a node property cannot silently fall back to Normal. **gl** realizes them with `applyBlendEffectToGl` over `registerGlBlendEffectBackdrop`; **wgpu** mirrors that contract with `applyBlendEffectToWgpu` over `registerWgpuBlendEffectBackdrop`, a dual-source fullscreen pass, and the same branch-based blend math in WGSL. A missing named backdrop deliberately passes the source through on both GPU backends. Canvas/DOM realize the same set natively. `effect-blend-advanced` produces the exact same WebGL and WebGPU raster. Caveat on the fixed-function set: `Darken`/`Lighten` (MIN/MAX) can't fold in the `(1-src.a)` term, so a transparent surround darkens/limits the backdrop at edges the way premultiplied `Multiply` no longer does.
2. **Open strokes tessellate on gl + wgpu; closed (ring) strokes still raster.** A **stroke-only** shape (no fill) resolves its `lineStyle` spans to fillable outlines via `@flighthq/shape` `getShapeStrokeRegions` → `@flighthq/path` `strokePath` (real miter/bevel/round joins, butt/round/square caps, dashing), and both `@flighthq/scene2d-gl` `drawGlShape` (`resolveGlShapeMeshRegions`) and `@flighthq/scene2d-wgpu` `drawWgpuShape` (`resolveWgpuShapeMeshRegions`) tessellate them to GPU meshes — resolution-independent, no offscreen raster. `shape-stroke-joints` (open V polylines) and `shape-stroke-caps` GPU-tessellate on canvas/dom/**webgl**/**webgpu**. Two cases still take the Canvas-2D raster fallback: a **filled-and-stroked** shape (the GPU fill + stroke mesh paths don't compose yet); and a **closed** stroke — a self-closing rectangle/ellipse/circle/round-rect primitive, or a return-to-start polyline, whose offset is a hollow RING the direct-fill tessellator can't hole-subtract (`getShapeStrokeRegions` detects closure geometrically and returns null; ring tessellation via a stroke-strip or stencil-cover route is a later addition). (Earlier the GL path had no join handling and a symmetric-corner miter collapsed onto the centerline vertex producing an untessellatable self-intersecting outline — fixed in `strokePath` by intersecting the offset lines along the segment tangent rather than the normal.)
3. **Per-Sprite filtering is unified in `Texture.sampler`.** The former node-local `Bitmap.smoothing` flag dissolved into `magFilter`/`minFilter`; textures with different samplers split the shared quad batch by texture identity and every backend reads the same sampler intent. GL reapplies sampler state on every resolve; WebGPU builds the group(1) sampler binding from the texture descriptor; canvas/DOM map nearest filtering to `imageSmoothingEnabled = false`.
4. **Per-instance ColorTransform tint is gl/wgpu only.** Only `registerGlColorTransformMaterial` / `registerWgpuColorTransformMaterials` exist; Canvas/DOM bitmap renderers have no color-transform material renderer, so a `materialData` ColorTransform draws untinted there. (`bitmap-color-transform` sidesteps this by tinting source pixels via `applySurfaceColorTransform`, which is cross-backend.)
5. **~~Text strikethrough not drawn on gl/wgpu.~~ FIXED.** The gl/wgpu RichText renderers (`glRichText`/`wgpuRichText`) are canvas-raster-backed, so — like canvas/dom — they now stroke the line-through at `baseline - ascent*0.35` alongside the existing `underline`, mirroring `scene2d-canvas`. `text-strikethrough` is a single bare scene covering canvas/dom/webgl/webgpu (the sibling of the all-backend `text-underline`).
6. **~~Orthographic projection renders blank on wgpu.~~ FIXED.** `writeWgpuFrameUniform` remaps the
   camera's GL-convention VP into WebGPU `[0,1]` NDC-Z. `camera-orthographic.webgpu.ts` now covers the
   previously blank raster path alongside the gl scene.
12. **~~wgpu bound one sampler per material while gl bound a sampler per map.~~ FIXED.**
    The wgpu classic and standard-PBR group(2) layouts now bind one cached `GPUSampler` beside every
    material map. `ensureWgpuPerMapMaterialBinding` tracks the parallel sampler/view identities, so a
    live non-primary sampler mutation rebuilds only the bind group and reuses its uniform buffer.
    `material-alpha-map-pbr` proves parity with a repeating base-color sampler and a clamped alpha-map
    sampler: both GL and WebGPU show one opacity falloff rather than repeating it. Legacy one-sampler
    material families retain `ensureWgpuMaterialBinding`; the shaded modifier layout remains unchanged
    with its alpha placeholder at binding 5 and modifier textures at 6+.
7. **~~Single-line RichText alignment renders nothing.~~ FIXED.** The gl/canvas RichText renderers passed a `10000` wrap-prevention sentinel as the layout width when `wordWrap` was false, so `applyAlignment` (`textLayout.ts`) centered the line against 10000 and shifted it ~4975px off-screen. Both renderers now pass `data.width` unconditionally (wrapping stays `wordWrap`-gated inside `computeTextLayout`), so single-line `align:'center'/'right'` renders correctly. (Number retained to keep gap #8–#10 references stable.)

## Feature gaps (not implemented at all — implement before testing)

8. **~~Punctual lights — wired on gl, not wgpu.~~ DONE.** Forward punctual lighting (point/spot/hemisphere) now shades on **both gl and wgpu**: `Scene3DLights` (`packages/types/src/Scene3DLights.ts`) carries `point`/`spot`/`hemisphere` arrays alongside `ambient`/`directional`, `packSceneLightBlock` (`packages/render/src/sceneRender.ts`) packs up to `MAX_FORWARD_LIGHTS` (= 4) of each type into the `SceneLightBlock`, and both backends consume them — gl via `u_pointLights`/`u_spotLights`/`u_hemisphereLights` uniform arrays (`GL_MESH_LIGHT_BLOCK_GLSL` in `packages/scene-gl/src/glLitProgram.ts`), wgpu via the expanded Frame struct's `pointLights`/`spotLights`/`hemisphereLights` arrays (`wgpuPbrPrelude.ts`). Both share the `shadePbrPunctual` factored BRDF (Cook-Torrance + extension lobes), `rangeWindow` inverse-square falloff, and cone smoothstep for spots. Area lights remain deferred (no `Scene3DLights.area` field).
9. **Group/layer blend.** A `blendMode` on a container (so the whole subtree composites as one layer) needs render-to-texture flattening; unverified whether the renderer does this. Treat as a gap until confirmed.
10. **~~TextureAtlasRegion pivot was stored but unread by sprite renderers.~~ FIXED.**
    Canvas draws the atlas sub-rectangle at the negative region pivot; GL and WebGPU fold that local
    origin through the sprite transform into the batched translation. `sprite-atlas` uses a center-pivoted
    green region and produces the same raster on Canvas, GL, and WebGPU.
11. **~~wgpu 3D transparent pass silently draws opaque.~~ FIXED.** `drawWgpuScene` now mirrors gl's
    pooled opaque/blended partition and back-to-front sort. Blended pipeline variants use src-alpha /
    one-minus-src-alpha compositing, retain depth testing, and disable depth writes; resolved node alpha
    is carried through the Draw uniform. `scene-transparent.webgpu.ts` proves the layered composition.

When you close one of these, update this table and un-scope the corresponding functional test's `renderers`.

## Related docs

- [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) — the WebGPU parity plan; transparent passes,
  orthographic projection, GPU skinning, ShadedMaterial, and advanced-blend effects are implemented.
- [render-architecture.md](render-architecture.md) — the **target** render/scene architecture (this doc is the current delta from it).
- [`functional-test` skill](../.claude/skills/functional-test/SKILL.md) — authoring a visual test; scope backends via `"renderers": [...]` in the test's `package.json`.
