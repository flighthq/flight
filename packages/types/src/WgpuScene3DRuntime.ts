import type { BlendMode } from './BlendMode';
import type { CustomShaderMaterial } from './CustomShaderMaterial';
import type { Matrix4 } from './Matrix4';
import type { Scene3DLightsLike } from './Scene3DLights';
import type { WgpuCustomMaterialShaderSource } from './WgpuCustomMaterialShaderSource';
import type { WgpuMeshPipeline } from './WgpuMeshPipeline';
import type { WgpuRenderState } from './WgpuRenderState';

// The active directional shadow for this state, set by drawWgpuScene3DShadowMap and read by the lit bind
// (beginWgpuMeshDraw → ensureWgpuShadowSampleBindGroup) so every lit family samples the same shadow map.
// The WGSL mirror of scene-gl's GlScene3DShadow. The depth texture is a sampleable depth32float target the
// depth pass renders into and the lit fs_main PCF-samples; `matrix` is the light view-projection (world →
// shadow clip). `enabled` is the per-frame gate; a disabled object may retain its texture for the next
// shadow pass. Null = no shadow resource yet (lit draws bind a 1x1 dummy depth texture, gated off by the
// shadow uniform). The depth texture is a non-GC GPU resource — freed by destroyWgpuScene3DShadow.
export interface WgpuScene3DShadow {
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  enabled: boolean;
  mapHeight: number;
  mapWidth: number;
  matrix: Matrix4;
  normalBiasWorld: number;
  pcfRadius: number;
  shadowBias: number;
}

// The baked image-based-lighting set for this state, produced by bakeWgpuEnvironmentIbl and read by the
// lit PBR bind (beginWgpuMeshDraw → ensureWgpuIblSampleBindGroup) so every PBR draw samples the same
// environment. The WGSL mirror of scene-gl's GlScene3DIbl. Null = no IBL this frame (the PBR ambient falls
// back to the flat ambient term; the lit draws bind 1x1 dummy cube/LUT textures gated off by the IBL
// uniform). The three GPU textures are the split-sum approximation: a diffuse irradiance cubemap, a
// roughness-mipped prefiltered specular cubemap, and the 2D BRDF integration LUT. `intensity` scales the
// environment's contribution (Environment.intensity). The textures are non-GC GPU resources — freed by
// destroyWgpuScene3DIbl. Each `*View` is the sampleable cube/2D view the lit bind wires into the PBR
// sample group.
export interface WgpuScene3DIbl {
  brdfLut: GPUTexture;
  brdfLutView: GPUTextureView;
  intensity: number;
  irradianceCube: GPUTexture;
  irradianceCubeView: GPUTextureView;
  prefilteredCube: GPUTexture;
  prefilteredCubeView: GPUTextureView;
  prefilteredMipCount: number;
}

export interface WgpuScene3DFrameBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
}

// A per-subset draw record held in drawWgpuScene3D's opaque/blended lists. Pooled on
// WgpuScene3DRuntime so rebuilding the two passes does not allocate each frame.
export interface WgpuScene3DDrawEntry {
  alpha: number;
  colorMatrix: object | null;
  colorScaleBias: object | null;
  depth: number;
  lightBlock: object;
  material: object;
  mesh: object;
  renderer: object;
  subset: object;
  worldMatrix: object;
}

// scene-wgpu's per-WgpuRenderState private state — the WGSL mirror of GlScene3DRuntime. Holds the 3D
// mesh-material pipeline cache (keyed by family + define key + color-attachment format), a reference
// to the device-owned geometry GPU-upload cache, the shared group(0)/group(1)
// Frame + Draw bind-group layouts (every family pipeline targets these), and the shared GPU resources
// the draw path reuses every frame (the Frame uniform buffer + its bind group, the dynamic-offset Draw
// bind group, the 1x1 placeholder map texture, and a per-material bind-group cache). `activeMeshPipeline`
// is the bind()→draw() handoff. All scene-wgpu-owned and distinct from the 2D renderer's
// material-renderer table/texture cache — a material kind is either 2D or 3D, never both. Dispatch policy
// lives in WgpuRenderStateRuntime.registries.meshMaterialRenderers; the upload cache is surfaced through
// the header's sceneMeshUploadCache slot; everything else lives only here. One WgpuScene3DRuntime is
// created lazily per state by getWgpuScene3DRuntime.
export interface WgpuScene3DRuntime {
  // The material blend equation for the active transparent run. Null for opaque runs; faded opaque
  // materials use BlendMode.Normal. WebGPU bakes this into the pipeline, so it is part of the shared
  // pipeline-cache identity alongside the transparent/opaque and skin variants.
  activeBlendMode: BlendMode | null;
  // Whether the run currently being bound uses the blended pipeline variant. drawWgpuScene3D sets this
  // before bind(); each family's ensure function folds it into the immutable pipeline state/cache key.
  activeBlendedRun: boolean;
  activeColorAdjustmentRun: boolean;
  activeColorMatrixRun: boolean;
  activeSkinnedRun: boolean;
  activeMeshPipeline: WgpuMeshPipeline | null;
  blendedDrawList: WgpuScene3DDrawEntry[];
  blendedPool: WgpuScene3DDrawEntry[];
  drawBindGroup: GPUBindGroup | null;
  drawBindGroupLayout: GPUBindGroupLayout | null;
  frameBindGroup: GPUBindGroup | null;
  frameBindGroupLayout: GPUBindGroupLayout | null;
  frameBuffer: GPUBuffer | null;
  // One immutable binding identity per Scene3DLightBlock. Queue writes for several selected blocks are
  // recorded before submit, so sharing one buffer would make every draw observe the final write.
  frameBindings: WeakMap<object, WgpuScene3DFrameBinding>;
  // Optional shakeable diagnostics for the fixed CustomShaderMaterial WGSL binding ABI.
  customShaderGuard?:
    | ((
        state: WgpuRenderState,
        shaderKey: string,
        source: WgpuCustomMaterialShaderSource,
        material: Readonly<CustomShaderMaterial>,
      ) => void)
    | null;
  // Optional diagnostic invoked when excess punctual inputs would be truncated without an explicit
  // prepareWgpuScene3DForwardLights result.
  forwardLightSelectionGuard?: ((lights: Readonly<Scene3DLightsLike>) => void) | null;
  // Image-based-lighting state (mirrors GlScene3DRuntime.ibl / environmentSourceCube). `environmentSource*`
  // is the uploaded source radiance cube (ensureWgpuEnvironmentSourceCube); `ibl` is the baked split-sum
  // result written by bakeWgpuEnvironmentIbl. The rest are the lazily-created singletons the lit sample
  // side (everything ibl* prefixed) reuses each frame: the IBL uniform buffer (enabled/intensity/maxMip),
  // a filtering sampler, 1x1 dummy cube + 2D LUT for the no-IBL case, and the shared sample
  // layout + bind group (rebuilt only when the bound irradiance view changes present ↔ absent). All
  // created lazily, so a state that never bakes IBL pays nothing. Freed by destroyWgpuScene3DIbl.
  environmentSourceCube: GPUTexture | null;
  environmentSourceCubeView: GPUTextureView | null;
  ibl: WgpuScene3DIbl | null;
  iblDummyCubeTexture: GPUTexture | null;
  iblDummyCubeView: GPUTextureView | null;
  iblDummyLutTexture: GPUTexture | null;
  iblDummyLutView: GPUTextureView | null;
  iblSampleBindGroup: GPUBindGroup | null;
  iblSampleCubeView: GPUTextureView | null;
  iblSampleLayout: GPUBindGroupLayout | null;
  iblSampler: GPUSampler | null;
  iblUniformBuffer: GPUBuffer | null;
  materialBindGroups: WeakMap<object, WgpuMaterialBinding>;
  pbrSampleBindGroup: GPUBindGroup | null;
  pbrSampleIblCubeView: GPUTextureView | null;
  pbrSampleLayout: GPUBindGroupLayout | null;
  pbrSampleShadowView: GPUTextureView | null;
  opaqueDrawList: WgpuScene3DDrawEntry[];
  opaquePool: WgpuScene3DDrawEntry[];
  pendingDrawOffset: number;
  // Column-major mat3 uv transform staged by a family's bind() (stashWgpuUvTransform) and folded into the
  // Draw uniform by the next writeWgpuDrawUniform, which resets it to identity after consuming.
  pendingUvTransform: Float32Array;
  pipelineCache: Map<string, WgpuMeshPipeline>;
  placeholderView: GPUTextureView | null;
  // Directional shadow state (mirrors GlScene3DRuntime.shadow/shadowTarget). `shadow` is the retained
  // resource and per-frame enabled/config result written by drawWgpuScene3DShadowMap; the rest are the lazily-created singletons the write side
  // (shadowDepthPipeline) and the sample side (everything shadowSample*/shadowUniform*/shadowDummy*/
  // shadowComparisonSampler) reuse each frame. The shadow-sample bind group is rebuilt only when the
  // bound depth view changes (present ↔ absent); its uniform is rewritten every bind. All created lazily,
  // so a state that never draws a shadow map pays nothing. Freed by destroyWgpuScene3DShadow.
  shadow: WgpuScene3DShadow | null;
  shadowComparisonSampler: GPUSampler | null;
  shadowDepthPipeline: GPURenderPipeline | null;
  shadowDepthSkinnedPipeline: GPURenderPipeline | null;
  shadowDummyTexture: GPUTexture | null;
  shadowDummyView: GPUTextureView | null;
  shadowSampleBindGroup: GPUBindGroup | null;
  shadowSampleLayout: GPUBindGroupLayout | null;
  shadowSampleView: GPUTextureView | null;
  shadowUniformBuffer: GPUBuffer | null;
  // Opaque scene-wgpu caches. Values stay unknown here so backend-private binding/plan records do not
  // leak into @flighthq/types; scene-wgpu narrows them at the ownership boundary.
  shadedMaterialBindingCache: WeakMap<object, unknown>;
  shadedMaterialPlanCache: WeakMap<object, unknown>;
  skinDrawBindGroup: GPUBindGroup | null;
  skinDrawBindGroupLayout: GPUBindGroupLayout | null;
  // The MESH path's own skin bind group and layout, carrying the normal palette at binding 2 alongside
  // the pose palette. Kept separate from the pair above rather than growing them.
  //
  // ★ A LAYOUT DECLARES WHAT A PIPELINE NEEDS, AND THE SHADOW PASS DOES NOT NEED NORMALS. It skins
  // positions only. Growing the shared layout would oblige the shadow path to SUPPLY a normal-palette
  // resource — a bind group must satisfy every binding its layout declares — so it would have to carry
  // something semantically meaningless forever, purely so the mesh path could have a binding. Two paths
  // with different needs sharing one declaration, where one fabricates an input to satisfy it, is the
  // decomposition smell; a second layout is the bounded, honest cost.
  skinMeshDrawBindGroup: GPUBindGroup | null;
  skinMeshDrawBindGroupLayout: GPUBindGroupLayout | null;
  // Each palette texture is a per-frame ARENA: every skinned draw owns a distinct region of it and reads
  // its own region through a base texel index carried in the Draw uniform.
  //
  // ★ THIS IS WHAT MAKES A SKINNED DRAW OWN ITS DATA AT SUBMIT TIME. A WebGPU frame records every draw
  // into one encoder and submits once, so all queue writes land BEFORE any of them execute. A palette
  // rewritten in place therefore does not give each draw the matrix it was built with — it gives every
  // draw the LAST one written, and two skeletons in a frame both render in the second one's pose. The
  // arena removes the overwrite instead of trying to order around it.
  //
  // The cursor is reset when a new frame's command encoder appears (`skinArenaFrame` is the stamp, not a
  // counter: render-wgpu creates the encoder per frame and nulls it at submit). The bases map is keyed by
  // the palette array itself, so a skeleton drawn by several meshes — or by both the shadow and mesh
  // passes — allocates ONE region and every draw of it samples the same texels.
  skinArenaFrame: GPUCommandEncoder | null;
  skinNormalPaletteArenaBases: Map<Readonly<Float32Array>, number> | null;
  skinNormalPaletteArenaCursor: number;
  skinNormalPaletteArenaRows: number;
  skinNormalPaletteTexture: GPUTexture | null;
  skinNormalPaletteView: GPUTextureView | null;
  skinPaletteArenaBases: Map<Readonly<Float32Array>, number> | null;
  skinPaletteArenaCursor: number;
  skinPaletteArenaRows: number;
  skinPaletteTexture: GPUTexture | null;
  skinPaletteView: GPUTextureView | null;
  // The arena base indices the NEXT Draw uniform write will publish. Written by the palette upload and
  // consumed — and cleared back to zero — by that write, so a rigid draw following a skinned one cannot
  // inherit a stale base.
  pendingSkinNormalPaletteBase: number;
  pendingSkinPaletteBase: number;
  skinningAdapter: unknown | null;
  uploadCache: WeakMap<object, WgpuMeshUpload>;
}

// The GPU upload of one MeshGeometry for one WgpuRenderState: the interleaved vertex buffer, the index
// buffer + its element format and count, and the geometry `version` the buffers were uploaded at (so a
// bumped version forces a re-upload). Cached in the upload cache keyed by the geometry entity, the
// per-state parallel of MeshGeometryRuntime.webgpuData.
//
// Non-indexed geometry is a first-class case, not an absence: `indexBuffer` and `indexFormat` are both
// null and `indexCount` carries the VERTEX count, so a caller branches on `indexBuffer` and issues a
// non-indexed draw over the same count. `indexFormat` is null rather than a default value because no
// format applies — a stand-in would read as a fact about a buffer that does not exist.
export interface WgpuMeshUpload {
  indexBuffer: GPUBuffer | null;
  indexCount: number;
  indexFormat: GPUIndexFormat | null;
  skinBindUploaded?: boolean;
  version: number;
  vertexBuffer: GPUBuffer;
}

// One material's per-state GPU binding: the Material uniform buffer (re-written each bind with the
// material's factors) and the bind group wiring it + the maps to the pipeline's material bind-group
// layout. `views`/`sampler` cache the resolved map texture views and the ONE material sampler the bind
// group was last built from; a binder re-resolves them each bind (into a reused scratch — no per-bind
// allocation) and rebuilds `bindGroup` only when one differs (a map swap, an unready→ready transition,
// an Image.version bump, or the primary-map sampler changing all yield a different resolved
// value), so a live material-map mutation is honored without per-frame bind-group churn. `views` is
// binder-owned and overwritten in place on rebuild. `sampler` is the single PRIMARY-map sampler wgpu
// binds for the whole material (see getWgpuMaterialSampler) — the shared-primary-sampler contract, so
// a non-primary map's per-Texture sampler does not participate. Optional so a binder that never
// re-resolves (or predates the cache) can omit them.
export interface WgpuMaterialBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
  // Per-map sampler cache for layouts that bind one immutable GPUSampler beside each texture view.
  // Classic and standard/PBR use this to honor every Texture.sampler independently.
  samplers?: GPUSampler[];
  // Legacy one-sampler layouts (unlit/toon/debug/matcap/shaded) retain this slot until their layouts
  // migrate to the per-map helper.
  sampler?: GPUSampler;
  views?: GPUTextureView[];
}
