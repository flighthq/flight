import type { Kind } from './Entity';
import type { Matrix4 } from './Matrix4';
import type { ModifierRegistry } from './ModifierRegistry';
import type { SceneLightsLike } from './SceneLights';
import type { WgpuMeshMaterialRenderer } from './WgpuMeshMaterialRenderer';
import type { WgpuMeshPipeline } from './WgpuMeshPipeline';

// The active directional shadow for this state, set by drawWgpuSceneShadowMap and read by the lit bind
// (beginWgpuMeshDraw → ensureWgpuShadowSampleBindGroup) so every lit family samples the same shadow map.
// The WGSL mirror of scene-gl's GlSceneShadow. The depth texture is a sampleable depth32float target the
// depth pass renders into and the lit fs_main PCF-samples; `matrix` is the light view-projection (world →
// shadow clip). Null = no shadow this frame (lit draws bind a 1x1 dummy depth texture, gated off by the
// shadow uniform). The depth texture is a non-GC GPU resource — freed by destroyWgpuSceneShadow.
export interface WgpuSceneShadow {
  depthTexture: GPUTexture;
  depthView: GPUTextureView;
  matrix: Matrix4;
}

// The baked image-based-lighting set for this state, produced by bakeWgpuEnvironmentIbl and read by the
// lit PBR bind (beginWgpuMeshDraw → ensureWgpuIblSampleBindGroup) so every PBR draw samples the same
// environment. The WGSL mirror of scene-gl's GlSceneIbl. Null = no IBL this frame (the PBR ambient falls
// back to the flat ambient term; the lit draws bind 1x1 dummy cube/LUT textures gated off by the IBL
// uniform). The three GPU textures are the split-sum approximation: a diffuse irradiance cubemap, a
// roughness-mipped prefiltered specular cubemap, and the 2D BRDF integration LUT. `intensity` scales the
// environment's contribution (Environment.intensity). The textures are non-GC GPU resources — freed by
// destroyWgpuSceneIbl. Each `*View` is the sampleable cube/2D view the lit bind wires into the PBR
// sample group.
export interface WgpuSceneIbl {
  brdfLut: GPUTexture;
  brdfLutView: GPUTextureView;
  intensity: number;
  irradianceCube: GPUTexture;
  irradianceCubeView: GPUTextureView;
  prefilteredCube: GPUTexture;
  prefilteredCubeView: GPUTextureView;
  prefilteredMipCount: number;
}

export interface WgpuSceneFrameBinding {
  bindGroup: GPUBindGroup;
  buffer: GPUBuffer;
}

// A per-subset draw record held in drawWgpuScene's opaque/blended lists. Pooled on
// WgpuSceneRuntime so rebuilding the two passes does not allocate each frame.
export interface WgpuSceneDrawEntry {
  alpha: number;
  depth: number;
  lightBlock: object;
  material: object;
  mesh: object;
  renderer: object;
  subset: object;
  worldMatrix: object;
}

// scene-wgpu's per-WgpuRenderState private state — the WGSL mirror of GlSceneRuntime. Holds the 3D
// mesh-material registry, the shared mesh-material pipeline cache (keyed by family + define key +
// color-attachment format), the per-state geometry GPU-upload cache, the shared group(0)/group(1)
// Frame + Draw bind-group layouts (every family pipeline targets these), and the shared GPU resources
// the draw path reuses every frame (the Frame uniform buffer + its bind group, the dynamic-offset Draw
// bind group, the 1x1 placeholder map texture, and a per-material bind-group cache). `activeMeshPipeline`
// is the bind()→draw() handoff. All scene-wgpu-owned and distinct from the 2D renderer's
// materialRendererMap/textureCache — a material kind is either 2D or 3D, never both. The registry and
// upload cache are surfaced through the header's WgpuRenderStateRuntime.sceneMeshMaterialRegistry /
// sceneMeshUploadCache slots (kept opaque there); everything else lives only here. One WgpuSceneRuntime
// is created lazily per state by getWgpuSceneRuntime.
export interface WgpuSceneRuntime {
  // Whether the run currently being bound uses the blended pipeline variant. drawWgpuScene sets this
  // before bind(); each family's ensure function folds it into the immutable pipeline state/cache key.
  activeBlendedRun: boolean;
  activeSkinnedRun: boolean;
  activeMeshPipeline: WgpuMeshPipeline | null;
  blendedDrawList: WgpuSceneDrawEntry[];
  blendedPool: WgpuSceneDrawEntry[];
  drawBindGroup: GPUBindGroup | null;
  drawBindGroupLayout: GPUBindGroupLayout | null;
  frameBindGroup: GPUBindGroup | null;
  frameBindGroupLayout: GPUBindGroupLayout | null;
  frameBuffer: GPUBuffer | null;
  // One immutable binding identity per SceneLightBlock. Queue writes for several selected blocks are
  // recorded before submit, so sharing one buffer would make every draw observe the final write.
  frameBindings: WeakMap<object, WgpuSceneFrameBinding>;
  // Optional diagnostic invoked when excess punctual inputs would be truncated without an explicit
  // prepareWgpuSceneForwardLights result.
  forwardLightSelectionGuard?: ((lights: Readonly<SceneLightsLike>) => void) | null;
  // Image-based-lighting state (mirrors GlSceneRuntime.ibl / environmentSourceCube). `environmentSource*`
  // is the uploaded source radiance cube (ensureWgpuEnvironmentSourceCube); `ibl` is the baked split-sum
  // result written by bakeWgpuEnvironmentIbl. The rest are the lazily-created singletons the lit sample
  // side (everything ibl* prefixed) reuses each frame: the IBL uniform buffer (enabled/intensity/maxMip),
  // a filtering sampler, 1x1 dummy cube + 2D LUT for the no-IBL case, and the shared sample
  // layout + bind group (rebuilt only when the bound irradiance view changes present ↔ absent). All
  // created lazily, so a state that never bakes IBL pays nothing. Freed by destroyWgpuSceneIbl.
  environmentSourceCube: GPUTexture | null;
  environmentSourceCubeView: GPUTextureView | null;
  ibl: WgpuSceneIbl | null;
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
  materialRegistry: Map<Kind, WgpuMeshMaterialRenderer>;
  modifierSnippetRegistry: ModifierRegistry | null;
  modifierSnippetRevision: number;
  opaqueDrawList: WgpuSceneDrawEntry[];
  opaquePool: WgpuSceneDrawEntry[];
  pendingDrawOffset: number;
  // Column-major mat3 uv transform staged by a family's bind() (stashWgpuUvTransform) and folded into the
  // Draw uniform by the next writeWgpuDrawUniform, which resets it to identity after consuming.
  pendingUvTransform: Float32Array;
  pipelineCache: Map<string, WgpuMeshPipeline>;
  placeholderView: GPUTextureView | null;
  // Directional shadow state (mirrors GlSceneRuntime.shadow/shadowTarget). `shadow` is the per-frame
  // result written by drawWgpuSceneShadowMap; the rest are the lazily-created singletons the write side
  // (shadowDepthPipeline) and the sample side (everything shadowSample*/shadowUniform*/shadowDummy*/
  // shadowComparisonSampler) reuse each frame. The shadow-sample bind group is rebuilt only when the
  // bound depth view changes (present ↔ absent); its uniform is rewritten every bind. All created lazily,
  // so a state that never draws a shadow map pays nothing. Freed by destroyWgpuSceneShadow.
  shadow: WgpuSceneShadow | null;
  shadowComparisonSampler: GPUSampler | null;
  shadowDepthPipeline: GPURenderPipeline | null;
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
  skinPaletteCapacity: number;
  skinPaletteTexture: GPUTexture | null;
  skinPaletteView: GPUTextureView | null;
  skinningAdapter: unknown | null;
  uploadCache: WeakMap<object, WgpuMeshUpload>;
}

// The GPU upload of one MeshGeometry for one WgpuRenderState: the interleaved vertex buffer, the index
// buffer + its element format and count, and the geometry `version` the buffers were uploaded at (so a
// bumped version forces a re-upload). Cached in the upload cache keyed by the geometry entity, the
// per-state parallel of MeshGeometryRuntime.webgpuData.
export interface WgpuMeshUpload {
  indexBuffer: GPUBuffer | null;
  indexCount: number;
  indexFormat: GPUIndexFormat;
  skinBindUploaded?: boolean;
  version: number;
  vertexBuffer: GPUBuffer;
}

// One material's per-state GPU binding: the Material uniform buffer (re-written each bind with the
// material's factors) and the bind group wiring it + the maps to the pipeline's material bind-group
// layout. `views`/`sampler` cache the resolved map texture views and the ONE material sampler the bind
// group was last built from; a binder re-resolves them each bind (into a reused scratch — no per-bind
// allocation) and rebuilds `bindGroup` only when one differs (a map swap, an unready→ready transition,
// an ImageResource.version bump, or the primary-map sampler changing all yield a different resolved
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
