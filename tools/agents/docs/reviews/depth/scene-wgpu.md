# Depth Review: @flighthq/scene-wgpu

**Domain**: WebGPU (WGSL) backend renderer for the 3D scene/mesh subject family — the per-backend leaf that turns a prepared `SceneNode` graph + `Camera` + `SceneLights` into draw calls, plus the full catalogue of mesh-material shaders (unlit, classic Blinn-Phong/Phong/Lambert, toon, matcap, normal/depth/vertex-color debug, wireframe, and a glTF-tier Cook-Torrance PBR uber-shader with its extension lobes).

**Verdict**: solid — 68/100

This is the WGSL mirror of `scene-gl` (36 source files vs. its 39), and the two are intentionally kept in lockstep. As a _material shading library_ it is genuinely deep and close to authoritative. As a _3D scene renderer_ it is explicitly a "proving slice": the lighting environment, transparency, and global-illumination layers a mature 3D renderer is judged on are documented as future work and not yet present. The depth is lopsided — AAA on materials, early on the renderer envelope around them.

## Present capabilities

Material families (each a `register*WgpuMaterial` + renderer +, where needed, a WGSL prelude):

- **PBR (Cook-Torrance)** — `wgpuPbrPrelude` is a real metallic-roughness uber-shader: GGX NDF, Smith height-correlated visibility, Fresnel-Schlick; base-color/normal/metallic-roughness/occlusion/emissive maps; sRGB→linear decode; alpha-mask discard; double-sided normal flip; linear-HDR output to an `rgba16float` target.
- **PBR extension lobes**, each a const-flag branch of the one uber-shader and a dedicated registrant: `clearcoat`, `sheen` (Charlie/Estevez-Kulla), `anisotropy` (Burley elliptical GGX), `iridescence` (thin-film), `specular` (KHR F0 scale/tint), `subsurface` (wrapped diffuse), `transmission`/volume. This is broad glTF KHR coverage — wider than most hobby renderers ship.
- **Specular-glossiness** and **standard PBR** packers as distinct renderers, so both glTF workflows are covered.
- **Classic / NPR / debug** families: `unlit`, `blinnPhong`, `phong`, `lambert`, `toon`, `matcap`, `emissive`, `vertexColor`, `normal`, `depth`, `wireframe` (line-list with a derived edge index buffer). Each has its own prelude where the shader differs (`wgpuClassicPrelude`, `wgpuToonPrelude`, `wgpuMatcapPrelude`, `wgpuUnlitPrelude`, `wgpuDebugPrelude`, `wgpuWireframePrelude`).
- **Renderer plumbing that is properly factored**: a kind-keyed mesh-material registry (`registerWgpuMeshMaterialRenderer` / `resolveWgpuMeshMaterialRenderer`, `DefaultMaterialKind` fallback), a define-key → pipeline cache (`wgpuPbrPipelineCache`, `ensureWgpu*Pipeline`, format-aware), per-geometry GPU upload caches with version invalidation (`ensureWgpuMeshUpload`, `ensureWgpuWireframeUpload`), group(0)/group(1)/group(2) Frame/Draw/Material bind-group layouts, dynamic-offset per-draw uniforms, a 1×1 placeholder texture for absent maps, and a per-state `WgpuSceneRuntime` surfaced through opaque header slots.
- **The draw loop** (`drawWgpuScene`) consumes the shared `prepareSceneRender` list (world matrices, view-projection, frustum culling, packed light block) and batches contiguous same-renderer/same-material subsets under one bind — a real, if minimal, state-sorting optimization.
- Naming, `Readonly<>` discipline, `out`-param packers (`writeWgpuPbrStandardBlock`), and side-effect-free `register*` opt-in all conform to house style.

## Gaps vs an authoritative 3D-scene-renderer library

The shading is deep; the renderer envelope is thin. Against a mature forward/clustered 3D renderer:

- **Lighting is a one-light proving slice (by design, but central).** `SceneLights` / `SceneLightBlock` carry _exactly one_ directional + one ambient term; the types themselves say the shape "grows to MAX_FORWARD_LIGHTS punctual lights (point/spot arrays) in later passes." There are **no point lights, no spot lights, no light arrays, no attenuation/range/cone math** in any prelude today. For a 3D renderer this is the single biggest depth gap.
- **No shadows.** No shadow-map pass, no depth-only render, no PCF/VSM, no cascaded shadow maps. Nothing in the package references shadows.
- **No image-based lighting / environment.** The PBR ambient term is flat irradiance only ("no IBL specular yet" in-source); there is no environment cubemap, no irradiance/prefiltered-env maps, no BRDF LUT, no reflection probes.
- **No transparency pipeline.** `wgpuMeshPipeline` configures _no blend state_ and always `depthWriteEnabled: true` / `depthCompare: 'less'`. There is no alpha-blended pipeline variant, no back-to-front transparent sort, no OIT. `transmission` is a coverage/tint approximation precisely because the refractive scene-color capture pass does not exist.
- **No instancing, skinning, or morph targets.** No instanced draw path, no joint/skin matrices, no morph-weight blending — standard mesh-renderer features for characters and crowds.
- **No post-processing / MSAA ownership here.** Tonemap/resolve is deferred to "the effect pipeline" and MSAA is not configured in these pipelines; acceptable as a layering choice, but it means this package alone does not produce a finished frame.
- **Fixed primitive coverage.** Only `triangle-list` (and `line-list` for wireframe). No triangle-strip, point-list particles, or LOD selection.

These are gaps-by-design in the sense that the source and types explicitly flag them as later passes — but they are gaps-by-omission against the AAA bar: a developer reaching for a "3D scene renderer" expects multiple lights and shadows as table stakes.

## Naming / API-shape notes

- Naming is exemplary and self-identifying: `compileWgpu*Pipeline` / `ensureWgpu*Pipeline` (compile vs. cache-or-compile), `build*DefineKey` / `build*DefineSource` / `get*ModuleSourceForKey` (key string vs. WGSL source), `bindWgpu*Surface` / `beginWgpuMeshDraw` / `drawWgpuMeshSubset`. The `Wgpu` infix and full type words make every export greppable and globally unique against the `scene-gl` twins.
- The exported surface is large and quite low-level (every prelude's key-builder, module-source getter, pipeline compiler, and bind helper is public). That is consistent with the codebase's small-functions philosophy and the need for tests/parity tooling to reach internals, but it is a wide public API for a leaf renderer — most consumers only need the `register*WgpuMaterial` functions and `drawWgpuScene`. Worth confirming the prelude internals genuinely need to be barrel-exported vs. being implementation detail.
- `writeWgpuPbrStandardBlock(out, …)` correctly follows the out-param convention; the per-draw `proxy` is documented as borrow-only and not retained — good ownership hygiene.

## Recommendation

Treat this as a **solid, well-architected renderer with an AAA material catalogue and an early-stage lighting/illumination envelope**. It is not a stub — the PBR + extension shading is real and broad — but it is not yet an authoritative 3D renderer because the lighting model is a single directional+ambient slice with no shadows, IBL, transparency, instancing, or skinning. The package's own types name the next steps. Priority order to move toward authoritative: (1) multi-light forward path (point/spot arrays + attenuation, the `MAX_FORWARD_LIGHTS` the types already anticipate); (2) shadow mapping; (3) an alpha-blended/transparent pipeline variant + sort (which also unblocks real transmission); (4) IBL ambient/specular. Because `scene-gl` is the deliberate twin, any of these should be designed once and mirrored across both backends. Hold the current depth lead in materials while closing the renderer-envelope gap.
