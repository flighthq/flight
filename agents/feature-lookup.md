# Feature Lookup

Quick-reference for common feature keywords: which package owns a capability, and which backends carry it today. All package names use the `@flighthq/` prefix.

"Backend" lists which renderers or runtimes support the feature today; "headless" means no renderer needed, "runtime" means any JS environment, "web" means browser APIs required, "parser" means pure data parsing.

| Feature | Package(s) | Backend | Notes |
| --- | --- | --- | --- |
| Shadows (directional) | `lighting` + `scene-gl` + `scene-wgpu` | gl, wgpu | Received by all lit families (PBR/classic/toon/shaded). WebGPU records the light-depth pass before the forward pass on one encoder via `beginWgpuFrame`; `shadow-directional` and `shadow-classic` carry raster proofs. See [wgpu-3d-parity-spec](wgpu-3d-parity-spec.md) §6 |
| Fog | `effects` (ScreenSpaceFogEffect) | canvas, gl, wgpu | Post-process effect |
| Ambient light | `lighting` | gl, wgpu |  |
| Directional light | `lighting` | gl, wgpu | Supports shadow config |
| Point light | `lighting`, Scene3DLights.point | gl, wgpu |  |
| Spot light | `lighting`, Scene3DLights.spot | gl, wgpu |  |
| Hemisphere light | `lighting`, Scene3DLights.hemisphere | gl, wgpu |  |
| Area light | `lighting` | --- | Descriptor exists, renderer not wired |
| IBL / Environment maps | `lighting` (createEnvironment) + `texture` (CubeTexture) | gl, wgpu |  |
| Particles (2D) | `particles` (sim) + `particleemitter` (display node) | canvas, gl, wgpu |  |
| Particles (3D) | `particles` (sim) + `particleemitter` (`ParticleEmitter3D`) | gl, wgpu | Camera-facing billboards; wgpu is host-captured |
| Collision (2D) | `collision` | headless | SAT narrow-phase; `test*Collision` for overlap + MTV, `collide*ContactManifold` for full contact points |
| Broadphase | `spatial` | headless | Uniform grid |
| Custom shaders (post-process) | `effects` (CustomShaderEffect) | gl, wgpu |  |
| Custom shaders (material) | `materials` (CustomShaderMaterial) + `scene-gl` + `scene-wgpu` | gl, wgpu | State-scoped GLSL/WGSL source registries; WGPU uses the fixed Frame/Draw/UserBlock/texture binding ABI |
| Bloom | `effects` (BloomEffect) | canvas, gl, wgpu |  |
| Blur | `effects` (BlurEffect) | canvas, gl, wgpu |  |
| Vignette | `effects` (VignetteEffect) | canvas, gl, wgpu |  |
| Tone mapping | `effects` (ToneMapEffect) | canvas, gl, wgpu |  |
| Drop shadow / Glow | `effects` (composite recipes) | canvas, gl, wgpu |  |
| Color adjustments | `adjustments` | canvas, gl, wgpu | Color matrix fuse |
| Materials (PBR) | `materials` (StandardPbrMaterial) | gl, wgpu |  |
| Materials (unlit) | `materials` (UnlitMaterial) | gl, wgpu |  |
| Materials (toon) | `materials` (ToonMaterial) | gl, wgpu |  |
| Material modifiers (ShadedMaterial) | `shading` (fresnel/normalPerturb/emissive/envReflect/fog/vertexDisplace/dissolve/toon) + `scene-gl` / `scene-wgpu` | gl, wgpu | Modifier stack composed into one program; working tangent-space normal map. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §4 |
| Blend modes (fixed-function) | `types` (`BlendMode`) node property | canvas, dom, gl, wgpu | Normal/Add/Subtract/Multiply/Screen/Darken/Lighten — GL fixed-function blend state, cheap node property |
| Blend modes (advanced / non-separable) | `effects` (`createBlendEffect` + `blendModeMath`) + `effects-gl` (`glBlendEffect`) + `effects-wgpu` (`wgpuBlendEffect`) | canvas, dom, gl, wgpu | Overlay/HardLight/SoftLight/Difference/Exclusion/ColorDodge/ColorBurn/Hue/Saturation/Color/Luminosity — an explicit `BlendEffect` composite recipe (offscreen source+backdrop pass), **not** a node property. canvas/dom native; gl/wgpu matching GPU passes. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §5 |
| Billboards | `scene` (createBillboard + orientSceneBillboardsToCamera) | gl, wgpu | axisY/full/screenAligned; draws via mesh renderers |
| Text | `text` | canvas, dom, gl, wgpu | TextLabel, RichText, NativeText |
| Text (bitmap) | `bitmaptext` + `bitmapfont` | canvas, gl, wgpu |  |
| Text input | `textinput` | headless |  |
| Audio | `audio` + `media` | web | Web Audio mixer |
| Video | `video` + `scene2d` | canvas, dom, gl, wgpu |  |
| Video texture (dynamic) | `texture` (VideoTexture) + `render-gl` (uploadGlTextureVideoFrame) | gl | Per-frame element upload, frameId dirty-gate; scene texture + 2D bitmap fill |
| Compressed textures | `texture-formats` (parse) + `render-gl` (upload + draw) | gl | Draws through the GL bitmap path when the opt-in `registerGlCompressedTextureUpload` seam is installed (a plain-bitmap bundle sheds the ~40-format enum table otherwise). BCn/ETC/ASTC/PVRTC + ATF native upload via `WEBGL_compressed_texture_*` + capability detect + RGBA decode fallback; Basis/supercompression transcode spec-only |
| Camera (2D) | `camera` (`Camera2D`) | headless | Deadzone, parallax, zoom (absorbed from former `camera2d`) |
| Camera (3D) | `camera` | gl, wgpu | Perspective, orthographic, frustum |
| Tween / Spring / Easing | `tween`, `spring`, `easing` | headless |  |
| Skeletal animation (GPU skinning) | `skeleton3d` + `animation` + `scene-gl` + `scene-wgpu` | gl, wgpu | `HAS_SKIN` across classic/pbr/toon/unlit/shaded with a growable single-row RGBA32F data-texture palette (`texelFetch` on gl, `textureLoad` on wgpu), no uniform-budget cap and no CPU draw fallback. WebGPU opts into its tree-shakeable permutation with `registerWgpuGpuSkinning(state)`. CPU kernel in `skeleton3d` is for bounds/picking only. [wgpu-3d-parity-spec.md](wgpu-3d-parity-spec.md) §3 |
| Morph / blend shapes | `mesh` + `scene` + `scene-gl` | gl | glTF/MD2 import; CPU-blend-then-upload. wgpu unbuilt |
| Spritesheet animation | `spritesheet` + `movieclip` | canvas, gl, wgpu |  |
| Path / shapes | `path` + `shape` | canvas, dom, gl, wgpu |  |
| Path booleans | `path-boolean` | headless |  |
| Hit testing | `interaction` | runtime |  |
| Tilemap | `sprite` + `tilemap-formats` | canvas, gl, wgpu | Tiled TMX/TMJ |
| Asset loading | `assets` + `loader` | runtime | Ref-counted, concurrent |
| glTF import | `scene-formats` | parser | JSON + GLB; PBR materials, textures (sampler/color-space/UV-transform), skins, morph, all animation channels, sparse accessors, external .bin/URIs |
| OBJ / MTL import | `scene-formats` | parser | `importObj`/`createScene3DFromObj` — groups, usemtl subsets, BlinnPhong |
| 3DS import | `scene-formats` | parser | `createScene3DFrom3ds`/`parse3ds` — meshes, per-face material subsets (MSH_MAT_GROUP), smoothing-group normals, shininess/transparency, diffuse textures (bump/height map parsed as metadata, not applied) |
| MD5 import | `scene-formats` | parser | `importMd5Mesh(meshSource, animSource?)` composer (or `createScene3DFromMd5Mesh` + `parseMd5Anim`) — mesh + skeleton + `.md5anim` skeletal animation |
| AWD2 import | `scene-formats` | parser | `createScene3DFromAwd2`/`parseAwd2` — AwayJS AWD2 (version-2) binary: meshes, skins, skeleton animation, materials as **ShadedMaterial** (diffuse color+alpha, diffuse/normal maps; method-bearing materials warn + import base only — method→modifier mapping deferred); deflate-compressed bodies via `registerAwd2DeflateDecompressor`. A version guard rejects non-2 files by version (see AWD3 row) rather than misparsing them. An AWD-loading example must register the shaded mesh renderer + `registerBuiltInModifiers` |
| AWD3 import | --- | --- | Chartered, not implemented — AwayJS SceneGraph format (version 3), recognized-and-rejected by the AWD2 version guard. Unnecessary for current demos; ranks below other unbuilt 3D formats (e.g. FBX). The `Awd2`-explicit API names reserve the bare `Awd3` namespace for this future parser |
| FBX import | --- | --- | Chartered, not implemented |
| SWF named-graph import | `swf` + `scene2d-resources` | parser | Uncompressed `FWS` named instances, affine transforms, and `SymbolClass`/`ExportAssets` linkage across recursive `DefineSprite` first-frame graphs into `Scene2DDocument`; later frames, visuals/extents, and compression are staged |
| Flow / game states | `flow` | headless |  |
| Snapshot / undo | `snapshot` | headless |  |
| Input | `input` | web | Keyboard/pointer/wheel/gamepad |
| Accessibility | `accessibility` | web | ARIA bridge |

See [package catalog](packages/catalog.md) for what each package owns, and [package map](packages/map.md) for full per-package detail and API surface.
