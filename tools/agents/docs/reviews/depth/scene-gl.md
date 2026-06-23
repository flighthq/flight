# Depth Review: @flighthq/scene-gl

**Domain:** WebGL2 forward renderer for the 3D scene graph — the per-subject leaf renderer that turns a `SceneNode` tree of `Mesh`es into draw calls over `render-gl`, with the mesh-material program/shader library (PBR uber-shader + classic/stylized/debug families) that a real-time 3D engine's GL backend is expected to provide.

**Verdict:** solid — 62/100

scene-gl is a genuinely deep, well-built **material/shader** library and a competent forward draw loop, but it is gated by a deliberate "proving slice" lighting model (exactly one directional + one ambient light, no shadows, no IBL) that keeps it short of an authoritative real-time 3D GL renderer. The material breadth is near-authoritative; the lighting/shadow/environment depth is partial-by-design.

## Present capabilities

A large, coherent surface (82 exports across 37 source files):

- **Forward draw loop** — `drawGlScene(state, scene, camera, lights)` consumes the `prepareSceneRender` cached `SceneRenderList`, iterates visible meshes and their geometry subsets, resolves each subset's material to a registered renderer, and batches contiguous same-renderer/same-material runs under a single `bind()` (camera + light + material uploaded once), then per-subset indexed `draw()`. Normal matrix derived per mesh; `DefaultMaterialKind` fallback; subsets with no renderer are skipped (no silent default).
- **PBR family (`glPbrPrelude`, 431 lines)** — a Cook-Torrance uber-shader: GGX distribution, Smith height-correlated visibility, Fresnel-Schlick, metallic-roughness workflow, sRGB-decode of color maps, glTF MR packing, base-color/normal/MR/occlusion/emissive maps, alpha-mask cutoff, double-sided/`gl_FrontFacing` handling. Linear-HDR output to an rgba16f target (tonemap owned by the effect pipeline). Plus **seven KHR-aligned extension lobes** behind `#ifdef`s: clearcoat, sheen (Charlie/inverted-GGX), anisotropy (Burley elliptical lobe), iridescence (thin-film), specular (`KHR_materials_specular`), subsurface (wrapped-diffuse), transmission (approximation, with a documented Phase-5 TODO for the real refractive path). Specialized per material via `GlPbrDefineKey` → cached compiled program (`glPbrProgramCache`).
- **Classic lit family (`glClassicPrelude`)** — Lambert / Phong / BlinnPhong as one define-switched uber-shader.
- **Stylized families** — Toon/cel (`glToonPrelude`: ramp-texture or stepped quantization), Matcap (`glMatcapPrelude`: view-space-normal material capture).
- **Unlit family (`glUnlitPrelude`)** — Unlit / Emissive / VertexColor flat-color paths.
- **Debug/utility (`glDebugPrelude`)** — linearized Depth and world-space Normal visualization; standalone Depth material renderer.
- **Wireframe (`glWireframePrelude`, `glWireframeUpload`)** — derived line-index buffer + flat line shader.
- **20 `register*GlMaterial` opt-in registrations**, one per family/variant, over a `GlMeshMaterialRenderer` registry keyed by material `Kind` (`glMeshMaterialRegistry`, `resolveGlMeshMaterialRenderer`).
- **Infrastructure** — shared lit-uniform block (`glLitProgram`: `GL_MESH_LIGHT_BLOCK_GLSL` + `bindGlMeshLightBlock` + `resolveGlLitLocations` as one source of truth for std140 layout vs CPU upload); geometry GPU upload cache keyed by `MeshGeometry` with version invalidation (`glMeshUpload`); per-state runtime with material registry + program cache + upload cache (`glSceneRuntime`); program linking (`linkGlProgram`); per-family define-key/source builders and `ensure*Program` caches.

This is a strong, idiomatic Flight package: free functions, `Readonly<>` params, `out`/proxy reuse, no top-level side effects, opt-in `register*`, lazy per-state runtime via runtime slots. The material/shader catalog alone is close to what a mature glTF-class GL renderer ships.

## Gaps vs an authoritative WebGL2 3D renderer library

The shading **library** is broad; the **renderer** is shallow in the dimensions that make 3D look real. All of these are missing-by-design (the source and `SceneLights` comments label them future passes), but they are real depth gaps against the domain bar:

- **Lighting is a one-light proving slice.** `SceneLights` / `SceneLightBlock` carry _at most one directional + one ambient_ term; `bindGlMeshLightBlock` uploads a single directional and single ambient, gated by 0/1 counts. **No point lights, no spot lights, no multiple lights, no light arrays, no attenuation/range/cone falloff.** The type comment explicitly defers "MAX_FORWARD_LIGHTS punctual lights (point/spot arrays)" to "later passes." An authoritative forward renderer supports N punctual lights (forward+/clustered or at least a bounded loop). This is the single biggest depth limiter.
- **No shadows of any kind.** No shadow map allocation, no depth-only pass, no PCF/VSM/CSM, no `samplerShadow`. Real-time 3D without shadows is not authoritative.
- **No image-based lighting / environment.** No cubemaps (`samplerCube`), no prefiltered specular environment, no irradiance map, no BRDF LUT, no skybox. The PBR ambient term is a flat `diffuseColor * ambientRadiance * occlusion` with an inline "no IBL specular yet" comment. Metals therefore render with no specular environment — the most visible PBR shortfall.
- **No transparency/blending pipeline.** drawGlScene has no sorting (no back-to-front for blended subsets, no front-to-back opaque sort), no OIT, no separate transparent pass. `transmission` is admitted to be a placeholder pending an opaque-scene-color capture pass.
- **No instanced rendering / GPU skinning / morph targets.** No `drawElementsInstanced` path, no joint/weight attributes, no skeletal animation, no morph-target blend — standard for a glTF-capable engine.
- **No vertex skinning of dynamic geometry, no LOD, no per-object frustum/occlusion control surfaced here** (culling lives upstream in `prepareSceneRender`, which is reasonable, but there is no GL-level instance/batch beyond the contiguous-run material batch).
- **Multi-UV / second texture coordinate set absent** — vertex layout is position/normal/tangent/uv0 only; many glTF assets use uv1 for occlusion/lightmaps.
- **No post-stage hooks here** (tonemap/bloom/SSAO) — correctly delegated to the effect pipeline, so not counted against this package, but worth noting the renderer alone produces only linear HDR.

## Naming / API-shape notes

- Naming is excellent and consistent: the `Gl` backend prefix is first (`glPbrPrelude`, `compileGlPbrProgram`, `bindGlMeshLightBlock`), matching the codebase's backend-prefix-first convention, and type words are unabbreviated (`drawGlMeshSubset`, `setGlMeshViewProjection`, `resolveGlMeshMaterialRenderer`). Globally self-identifying.
- The `build*DefineKey` / `build*DefineSource` / `get*SourceForKey` / `ensure*Program` / `compile*Program` quartet is uniform across all six shader families — highly learnable and grep-able.
- `bind()`→`draw()` handoff via `activeMeshProgram` on the runtime, and the reused `proxy: SceneRenderProxy` owned by drawGlScene, are documented as borrow-not-retain. Clean entity/runtime discipline.
- The split between `register*GlMaterial` (opt-in, tree-shakable per family) and the registry resolve path is exactly the right shape for bundle discipline — a user who wants only Unlit pays for nothing else.
- One mild surface-area note: 20 separate `register*GlMaterial` functions plus per-family preludes is a lot of exports, but each is genuinely independent and the symmetry justifies it.

## Recommendation

Treat scene-gl as a **solid, near-authoritative material library bolted to a deliberately minimal forward renderer.** The shader catalog (full PBR + 7 KHR extensions + classic + toon + matcap + unlit/emissive/vertex-color + debug + wireframe) is a real strength and close to AAA for its slice. To reach an authoritative real-time 3D GL renderer, the priority order is:

1. **Multi-light forward path** — extend `SceneLights`/`SceneLightBlock` to point + spot + N directional with attenuation/cone falloff and a bounded shader loop (or forward+/clustered). This unblocks every lit family at once and is the highest-leverage gap.
2. **Shadow mapping** — at minimum a directional CSM + spot/point shadow pass with PCF.
3. **IBL** — prefiltered cubemap specular + irradiance + BRDF LUT + skybox, to make the PBR family physically complete.
4. **Transparency pass** — depth-sorted blended subsets, then revisit `transmission` with the opaque-scene capture the TODO calls for.
5. **Instancing + GPU skinning + morph targets** for glTF-class asset coverage.

These are largely cross-cutting with `scene`, `lighting`, `types` (the light block shape), and the `scene-wgpu` sibling, so the lighting/shadow/IBL expansion should be raised as a coordinated design step rather than done unilaterally inside scene-gl. Within the package itself, items achievable in isolation (multi-UV attribute, transparent-sort in drawGlScene) can be tracked locally.
