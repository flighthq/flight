import { getCamera3DPosition, getCamera3DViewProjectionMatrix4 } from '@flighthq/camera/contract';
import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createMatrix3, createMatrix4 } from '@flighthq/geometry/contract';
import {
  getWgpuBlendState,
  getWgpuRenderStateDeviceResources,
  getWgpuRenderStateRuntime,
  getWgpuSampler,
  resolveWgpuTexture,
} from '@flighthq/render-wgpu/contract';
import { getTextureUvMatrix, hasTextureSource, hasTextureUvTransform } from '@flighthq/texture/contract';
import type {
  Camera3D,
  EntityConstruction,
  Material,
  MeshGeometry,
  Scene3DLightBlock,
  Scene3DRenderProxy,
  SurfaceMaterial,
  Texture,
  TextureLike,
  WgpuColorAdjustmentMaterialFeature,
  WgpuMaterialBinding,
  WgpuMeshPipeline,
  WgpuRenderState,
  WgpuScene3DLayouts,
  WgpuScene3DShadow,
} from '@flighthq/types/contract';
import {
  BlendMode,
  MAX_DIRECTIONAL_SHADOW_PCF_RADIUS,
  MAX_FORWARD_LIGHTS,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_HEMISPHERE_STRIDE,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_POINT_STRIDE,
  SCENE_LIGHT_SPOT_OFFSET,
  SCENE_LIGHT_SPOT_STRIDE,
} from '@flighthq/types/contract';
import type { WgpuSkinningAdapter } from '@flighthq/types/contract';

import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
import { getWgpuScene3DRuntime } from './wgpuScene3DRuntime';
// Sets the family's pipeline active for the bind→draw handoff, binds it, and binds the shared Frame
// bind group at group(0). A family's bind() calls this after selecting its pipeline + writing the
// Frame uniform; draw() reads scene.activeMeshPipeline back. Mirrors scene-gl's beginGlMeshDraw.
export function beginWgpuMeshDraw(state: WgpuRenderState, pipeline: Readonly<WgpuMeshPipeline>): void {
  const stateRuntime = getWgpuRenderStateRuntime(state);
  const pass = stateRuntime.renderPass;
  if (pass === null) return;
  const scene = getWgpuScene3DRuntime(state);
  scene.activeMeshPipeline = pipeline;
  pass.setPipeline(pipeline.pipeline);
  pass.setBindGroup(0, scene.frameBindGroup!);
  // Lit families that PCF-sample the directional shadow map carry a group(3) shadow layout; bind the
  // shared shadow-sample group (the real depth map when drawWgpuScene3DShadowMap ran this frame, else a
  // 1x1 dummy gated off by the shadow uniform). Non-lit families have no group(3) and skip this.
  if (pipeline.hasPbrSampleGroup) {
    pass.setBindGroup(3, ensureWgpuPbrSampleBindGroup(state));
  } else if (pipeline.hasShadowGroup) {
    pass.setBindGroup(3, ensureWgpuShadowSampleBindGroup(state));
  }
  // Legacy IBL-only layouts are still supported for callers that provide one directly.
  if (pipeline.hasIblGroup) {
    pass.setBindGroup(4, ensureWgpuIblSampleBindGroup(state));
  }
}

// Builds a material bind group in the shared classic/PBR entry layout: the uniform buffer at binding 0,
// the sampler at binding 1, then each resolved map view at binding 2 + i. Both the classic and standard-
// PBR binders share this shape, so the same builder + the same rebuild check (below) cover both.
export function buildWgpuMaterialBindGroup(
  state: WgpuRenderState,
  layout: GPUBindGroupLayout,
  buffer: GPUBuffer,
  sampler: GPUSampler,
  views: readonly GPUTextureView[],
): GPUBindGroup {
  const entries: GPUBindGroupEntry[] = [
    { binding: 0, resource: { buffer } },
    { binding: 1, resource: sampler },
  ];
  for (let i = 0; i < views.length; i++) entries.push({ binding: 2 + i, resource: views[i] });
  return state.device.createBindGroup({ layout, entries });
}

// Per-map material bind group: uniform at binding 0, N samplers at 1..N, then N matching texture
// views at N+1..2N. Keeping the two equal-length arrays parallel makes each WGSL map select its own
// Texture.sampler while preserving a fixed layout for absent maps via placeholder views/default samplers.
export function buildWgpuPerMapMaterialBindGroup(
  state: WgpuRenderState,
  layout: GPUBindGroupLayout,
  buffer: GPUBuffer,
  samplers: readonly GPUSampler[],
  views: readonly GPUTextureView[],
): GPUBindGroup {
  const count = views.length;
  const entries: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer } }];
  for (let i = 0; i < count; i++) entries.push({ binding: 1 + i, resource: samplers[i] });
  for (let i = 0; i < count; i++) entries.push({ binding: 1 + count + i, resource: views[i] });
  return state.device.createBindGroup({ layout, entries });
}

export function createWgpuMeshPipeline(
  state: WgpuRenderState,
  options: Readonly<{
    blended?: boolean;
    doubleSided: boolean;
    extraBindGroupLayout?: GPUBindGroupLayout;
    format: GPUTextureFormat;
    iblBindGroupLayout?: GPUBindGroupLayout;
    materialBindGroupLayout: GPUBindGroupLayout;
    module: GPUShaderModule;
    pbrSampleBindGroupLayout?: GPUBindGroupLayout;
    shadowBindGroupLayout?: GPUBindGroupLayout;
    skinned?: boolean;
    topology?: GPUPrimitiveTopology;
  }>,
): WgpuMeshPipeline {
  const out = allocateEntity<WgpuMeshPipeline>();
  initializeWgpuMeshPipeline(out, state, options);
  return finishEntity(out);
}

// The shared per-draw tail for every mesh-material family: ring-allocates + writes the Draw uniform
// (world + normal matrix) for the proxy, lazily uploads the geometry's GPU buffers (cached by
// geometry.version), binds the dynamic-offset Draw group at group(1) + the vertex/index buffers, and
// issues the indexed draw over the proxy's subset. A family's draw() reads scene.activeMeshPipeline (set
// by beginWgpuMeshDraw) before calling this. Mirrors scene-gl's drawGlMeshSubset.
export function drawWgpuMeshSubset(
  state: WgpuRenderState,
  proxy: Readonly<Scene3DRenderProxy>,
  geometry: Readonly<MeshGeometry>,
): void {
  const stateRuntime = getWgpuRenderStateRuntime(state);
  const pass = stateRuntime.renderPass;
  const scene = getWgpuScene3DRuntime(state);
  if (pass === null || scene.activeMeshPipeline === null) return;

  const subset = proxy.subset;
  if (subset.indexCount === 0) return;

  const upload = ensureWgpuMeshUpload(state, geometry, scene.activeMeshPipeline.skinned);

  const activePipeline = scene.activeMeshPipeline;
  const jointMatrices = proxy.jointMatrices ?? null;
  const normalMatrices = proxy.normalMatrices ?? null;
  const skinning = scene.skinningAdapter as WgpuSkinningAdapter | null;
  // The mesh path binds the layout carrying BOTH palettes, so it must supply both. Requiring the normal
  // palette here as well keeps a half-supplied bind group from ever being built — a bind group must
  // satisfy every binding its layout declares, so one missing palette is a validation failure, not a
  // degraded draw.
  //
  // Both palettes are claimed BEFORE the Draw uniform is written: each returns the arena base its region
  // starts at, and those bases ride in that uniform. Writing first would publish a base for a region this
  // draw has not been given yet.
  const skinDrawBindGroup =
    activePipeline.skinned && jointMatrices !== null && normalMatrices !== null && skinning !== null
      ? skinning.getMeshDrawBindGroup(state, jointMatrices, normalMatrices)
      : null;
  const drawBindGroup = writeWgpuDrawUniform(state, proxy);
  const boundDrawGroup = skinDrawBindGroup ?? drawBindGroup;
  _dynamicOffsets[0] = scene.pendingDrawOffset;

  pass.setBindGroup(1, boundDrawGroup, _dynamicOffsets);
  pass.setVertexBuffer(0, upload.vertexBuffer);
  const hasInstances =
    proxy.instanceMatrices !== null &&
    proxy.instanceMatrices !== undefined &&
    proxy.instanceCount !== undefined &&
    proxy.instanceCount > 0;
  const instanceCount = hasInstances ? proxy.instanceCount! : 1;
  pass.setVertexBuffer(
    1,
    ensureWgpuInstanceBuffer(state, hasInstances ? proxy.instanceMatrices! : null, instanceCount),
  );
  // Non-indexed geometry draws the vertex range directly, matching glMeshProgram's drawElements /
  // drawArrays split. The subset's indexCount/indexOffset address vertices in that case.
  if (upload.indexBuffer === null) {
    pass.draw(subset.indexCount, instanceCount, subset.indexOffset, 0);
  } else {
    pass.setIndexBuffer(upload.indexBuffer, upload.indexFormat!);
    pass.drawIndexed(subset.indexCount, instanceCount, subset.indexOffset, 0, 0);
  }
}

// Whether a draw's fragment alpha is COVERAGE the compositor should honor. A material with no surface
// trailer (or none at all) is treated as opaque, matching the registry's own fallback.
function isWgpuMeshAlphaCoverage(material: Readonly<Material> | null | undefined): boolean {
  return material != null && (material as Readonly<SurfaceMaterial>).alphaMode === 'blend';
}

// Resolves the shared Frame bind group, creating it from the shared Frame layout + Frame buffer on
// first use. Every family pipeline declares the same group(0) layout, so this one bind group is valid
// for all of them.
export function ensureWgpuFrameBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.frameBuffer === null) {
    scene.frameBuffer = state.device.createBuffer({
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.frameBindGroup === null) {
    scene.frameBindGroup = state.device.createBindGroup({
      layout: ensureWgpuScene3DLayouts(state).frameBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: scene.frameBuffer } }],
    });
  }
  return scene.frameBindGroup;
}

const instanceBuffers = new WeakMap<WgpuRenderState, { buffer: GPUBuffer; capacity: number }>();
const identityInstance = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// Resolves the shared IBL sample bind group a caller binds when its pipeline carries the
// legacy standalone IBL layout — the WGSL counterpart of scene-gl's IBL texture-unit + u_ibl* uniform binds in
// bindGlMeshLightBlock. Lazily creates the IBL uniform buffer (enabled/intensity/maxMip), a filtering
// sampler, and 1x1 dummy cube + 2D-LUT textures for the no-IBL case, then rewrites the uniform every call
// (from scene.ibl) and rebuilds the bind group only when the bound irradiance view changes (present ↔
// absent). A scene with no baked environment still renders: the dummy views are bound and the shader's
// `enabled < 0.5` gate keeps them unsampled — mirroring GL's u_iblEnabled = 0 placeholder path.
export function ensureWgpuIblSampleBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const device = state.device;

  if (scene.iblUniformBuffer === null) {
    scene.iblUniformBuffer = device.createBuffer({
      size: IBL_SAMPLE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.iblSampler === null) {
    // Trilinear so the prefiltered specular cube's roughness mip chain (textureSampleLevel) filters.
    scene.iblSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
  }
  if (scene.iblDummyCubeView === null) {
    // 1x1 cube + 1x1 2D bound when no IBL is baked this frame; never sampled (the enabled flag gates them
    // off), they only satisfy the texture_cube / texture_2d slots so the draw is valid.
    scene.iblDummyCubeTexture = device.createTexture({
      size: [1, 1, 6],
      format: IBL_DUMMY_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    scene.iblDummyCubeView = scene.iblDummyCubeTexture.createView({ dimension: 'cube' });
    scene.iblDummyLutTexture = device.createTexture({
      size: [1, 1, 1],
      format: IBL_DUMMY_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    scene.iblDummyLutView = scene.iblDummyLutTexture.createView();
  }

  const ibl = scene.ibl;
  const u = _iblSampleScratch;
  if (ibl !== null) {
    u[0] = 1; // enabled
    u[1] = ibl.intensity;
    u[2] = ibl.prefilteredMipCount - 1; // maxMip (roughness 1.0)
  } else {
    u[0] = 0;
    u[1] = 1;
    u[2] = 0;
  }
  u[3] = 0;
  device.queue.writeBuffer(scene.iblUniformBuffer, 0, u.buffer, 0, IBL_SAMPLE_UNIFORM_BYTES);

  const irradianceView = ibl !== null ? ibl.irradianceCubeView : scene.iblDummyCubeView;
  const prefilteredView = ibl !== null ? ibl.prefilteredCubeView : scene.iblDummyCubeView;
  const brdfView = ibl !== null ? ibl.brdfLutView : scene.iblDummyLutView!;
  if (scene.iblSampleBindGroup === null || scene.iblSampleCubeView !== irradianceView) {
    scene.iblSampleBindGroup = device.createBindGroup({
      layout: ensureWgpuIblSampleLayout(state),
      entries: [
        { binding: 0, resource: { buffer: scene.iblUniformBuffer } },
        { binding: 1, resource: irradianceView },
        { binding: 2, resource: prefilteredView },
        { binding: 3, resource: brdfView },
        { binding: 4, resource: scene.iblSampler },
      ],
    });
    scene.iblSampleCubeView = irradianceView;
  }
  return scene.iblSampleBindGroup;
}

// Resolves the shared standalone IBL sample bind-group layout (uniform enabled/intensity/maxMip, a diffuse
// irradiance cube, a prefiltered specular cube, a 2D BRDF LUT, and a filtering sampler), created once per
// state. Lit PBR pipelines pass this to createWgpuMeshPipeline; the shared bind group built by
// ensureWgpuIblSampleBindGroup targets it, so one IBL bind group serves every lit PBR pipeline variant.
export function ensureWgpuIblSampleLayout(state: WgpuRenderState): GPUBindGroupLayout {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.iblSampleLayout === null) {
    scene.iblSampleLayout = state.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
  }
  return scene.iblSampleLayout;
}

export function ensureWgpuInstanceBuffer(
  state: WgpuRenderState,
  matrices: Readonly<Float32Array> | null | undefined,
  instanceCount: number,
): GPUBuffer {
  const source = matrices !== null && matrices !== undefined ? matrices : identityInstance;
  const required = Math.max(1, instanceCount) * 64;
  let cached = instanceBuffers.get(state);
  if (cached === undefined || cached.capacity < required) {
    cached?.buffer.destroy();
    const capacity = Math.max(required, 64 * 64);
    cached = {
      buffer: state.device.createBuffer({
        size: capacity,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      }),
      capacity,
    };
    instanceBuffers.set(state, cached);
  }
  state.device.queue.writeBuffer(cached.buffer, 0, source.buffer, source.byteOffset, required);
  return cached.buffer;
}

// Fetches (or on first use creates) the per-material binding cached under `key`, rebuilding its bind
// group ONLY when the primary sampler or a resolved map view differs from the cached set. The hot path
// (an unchanged material re-bound every frame) allocates nothing: the caller fills a REUSED `views`
// scratch, this compares it against the binding's owned view array in place, and returns the cached
// bind group untouched. On a create OR a rebuild — both change events, not steady state —
// buildWgpuMaterialBindGroup (re)allocates the GPUBindGroupEntry array; the binding's own view-array
// copy is allocated only on create (or a view-count change), and a rebuild reuses the buffer and
// overwrites the owned view array in place. This is the shared no-hidden-allocation cache both the
// classic and standard-PBR binders route through. The caller still writes the uniform buffer + stashes
// the uv transform after this returns.
export function ensureWgpuMaterialBinding(
  state: WgpuRenderState,
  key: object,
  layout: GPUBindGroupLayout,
  uniformByteSize: number,
  sampler: GPUSampler,
  views: readonly GPUTextureView[],
): WgpuMaterialBinding {
  const scene = getWgpuScene3DRuntime(state);
  let binding = scene.materialBindGroups.get(key);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: uniformByteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    binding = {
      bindGroup: buildWgpuMaterialBindGroup(state, layout, buffer, sampler, views),
      buffer,
      sampler,
      views: views.slice(),
    };
    scene.materialBindGroups.set(key, binding);
  } else if (isWgpuMaterialBindGroupRebuildNeeded(binding, sampler, views)) {
    binding.bindGroup = buildWgpuMaterialBindGroup(state, layout, binding.buffer, sampler, views);
    binding.sampler = sampler;
    // Overwrite the binding-owned view array in place — never alias the reused caller scratch, which the
    // next material's bind will overwrite.
    const cached = binding.views;
    if (cached === undefined || cached.length !== views.length) {
      binding.views = views.slice();
    } else {
      for (let i = 0; i < views.length; i++) cached[i] = views[i];
    }
  }
  return binding;
}

// Resolves the combined PBR sample bind group. WebGPU's required maxBindGroups minimum is 4, so PBR
// cannot afford separate shadow group(3) and IBL group(4). This layout packs both into group(3).
export function ensureWgpuPbrSampleBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const device = state.device;

  if (scene.shadowUniformBuffer === null) {
    scene.shadowUniformBuffer = device.createBuffer({
      size: SHADOW_SAMPLE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.shadowComparisonSampler === null) {
    scene.shadowComparisonSampler = device.createSampler({ compare: 'less-equal' });
  }
  if (scene.shadowDummyView === null) {
    scene.shadowDummyTexture = device.createTexture({
      size: [1, 1, 1],
      format: SHADOW_DEPTH_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    scene.shadowDummyView = scene.shadowDummyTexture.createView();
  }

  if (scene.iblUniformBuffer === null) {
    scene.iblUniformBuffer = device.createBuffer({
      size: IBL_SAMPLE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.iblSampler === null) {
    scene.iblSampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
    });
  }
  if (scene.iblDummyCubeView === null) {
    scene.iblDummyCubeTexture = device.createTexture({
      size: [1, 1, 6],
      format: IBL_DUMMY_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    scene.iblDummyCubeView = scene.iblDummyCubeTexture.createView({ dimension: 'cube' });
    scene.iblDummyLutTexture = device.createTexture({
      size: [1, 1, 1],
      format: IBL_DUMMY_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    scene.iblDummyLutView = scene.iblDummyLutTexture.createView();
  }

  const shadow = writeWgpuShadowSampleUniform(state);

  const ibl = scene.ibl;
  const u = _iblSampleScratch;
  if (ibl !== null) {
    u[0] = 1;
    u[1] = ibl.intensity;
    u[2] = ibl.prefilteredMipCount - 1;
  } else {
    u[0] = 0;
    u[1] = 1;
    u[2] = 0;
  }
  u[3] = 0;
  device.queue.writeBuffer(scene.iblUniformBuffer, 0, u.buffer, 0, IBL_SAMPLE_UNIFORM_BYTES);

  const shadowView = shadow !== null ? shadow.depthView : scene.shadowDummyView!;
  const irradianceView = ibl !== null ? ibl.irradianceCubeView : scene.iblDummyCubeView!;
  const prefilteredView = ibl !== null ? ibl.prefilteredCubeView : scene.iblDummyCubeView!;
  const brdfView = ibl !== null ? ibl.brdfLutView : scene.iblDummyLutView!;
  if (
    scene.pbrSampleBindGroup === null ||
    scene.pbrSampleShadowView !== shadowView ||
    scene.pbrSampleIblCubeView !== irradianceView
  ) {
    scene.pbrSampleBindGroup = device.createBindGroup({
      layout: ensureWgpuPbrSampleLayout(state),
      entries: [
        { binding: 0, resource: { buffer: scene.shadowUniformBuffer } },
        { binding: 1, resource: shadowView },
        { binding: 2, resource: scene.shadowComparisonSampler },
        { binding: 3, resource: { buffer: scene.iblUniformBuffer } },
        { binding: 4, resource: irradianceView },
        { binding: 5, resource: prefilteredView },
        { binding: 6, resource: brdfView },
        { binding: 7, resource: scene.iblSampler },
      ],
    });
    scene.pbrSampleShadowView = shadowView;
    scene.pbrSampleIblCubeView = irradianceView;
  }
  return scene.pbrSampleBindGroup;
}

export function ensureWgpuPbrSampleLayout(state: WgpuRenderState): GPUBindGroupLayout {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.pbrSampleLayout === null) {
    scene.pbrSampleLayout = state.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 7, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
  }
  return scene.pbrSampleLayout;
}

export function ensureWgpuPerMapMaterialBinding(
  state: WgpuRenderState,
  key: object,
  layout: GPUBindGroupLayout,
  uniformByteSize: number,
  samplers: readonly GPUSampler[],
  views: readonly GPUTextureView[],
): WgpuMaterialBinding {
  const scene = getWgpuScene3DRuntime(state);
  let binding = scene.materialBindGroups.get(key);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: uniformByteSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    binding = {
      bindGroup: buildWgpuPerMapMaterialBindGroup(state, layout, buffer, samplers, views),
      buffer,
      samplers: samplers.slice(),
      views: views.slice(),
    };
    scene.materialBindGroups.set(key, binding);
  } else if (wgpuPerMapMaterialBindGroupNeedsRebuild(binding, samplers, views)) {
    binding.bindGroup = buildWgpuPerMapMaterialBindGroup(state, layout, binding.buffer, samplers, views);
    overwriteIdentityCache(binding, 'samplers', samplers);
    overwriteIdentityCache(binding, 'views', views);
  }
  return binding;
}

// The one-time opaque-white 1x1 RGBA texture view bound to a family's map slots in the untextured
// path, so a material bind-group layout that declares texture slots can be satisfied without uploading
// real maps. Shared across families (cached on the scene runtime).
export function ensureWgpuPlaceholderTextureView(state: WgpuRenderState): GPUTextureView {
  const scene = getWgpuScene3DRuntime(state);
  let view = scene.placeholderView;
  if (view === null) {
    const texture = state.device.createTexture({
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    state.device.queue.writeTexture({ texture }, WHITE_PIXEL, { bytesPerRow: 4 }, [1, 1, 1]);
    view = texture.createView();
    scene.placeholderView = view;
  }
  return view;
}

// Resolves the shared group(0) Frame + group(1) Draw bind-group layouts, creating them once per state.
// group(0) is a single uniform visible to both stages (camera + lights); group(1) is a dynamic-offset
// uniform visible to the vertex scene2d (per-draw world + normal matrix).
export function ensureWgpuScene3DLayouts(state: WgpuRenderState): WgpuScene3DLayouts {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.frameBindGroupLayout === null || scene.drawBindGroupLayout === null) {
    const device = state.device;
    scene.frameBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    scene.drawBindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform', hasDynamicOffset: true },
        },
      ],
    });
  }
  return { drawBindGroupLayout: scene.drawBindGroupLayout, frameBindGroupLayout: scene.frameBindGroupLayout };
}

// Resolves a compiled pipeline for a string cache key, compiling it via the factory on first use and
// caching it on the scene runtime's per-state pipelineCache. Every family routes its pipeline through
// this one cache; the key is namespaced by family + define key + color format (for example
// `unlit:bgra8unorm|-c-`) and suffixed with blend equation + skinning, so families and immutable state
// variants compile at most once and never collide. Mirrors scene-gl's ensureGlScene3DProgram.
export function ensureWgpuScene3DPipeline<T extends WgpuMeshPipeline>(
  state: WgpuRenderState,
  key: string,
  compile: (blended: boolean, skinned: boolean) => T,
): T {
  const runtime = getWgpuScene3DRuntime(state);
  const blended = runtime.activeBlendedRun;
  const blendMode = blended ? (runtime.activeBlendMode ?? BlendMode.Normal) : null;
  const skinned = runtime.activeSkinnedRun;
  const variantKey = `${key}|${blendMode === null ? 'opaque' : `blend:${blendMode}`}|${skinned ? 'skin' : 'rigid'}`;
  let pipeline = runtime.pipelineCache.get(variantKey);
  if (pipeline === undefined) {
    pipeline = compile(blended, skinned);
    runtime.pipelineCache.set(variantKey, pipeline);
  }
  return pipeline as T;
}

// Resolves the shared group(3) shadow-sample bind group a lit family binds when its pipeline carries the
// shadow layout — the WGSL counterpart of scene-gl's shadow texture-unit + u_shadow* uniform binds in
// bindGlMeshLightBlock. Lazily creates the shadow uniform buffer (light matrix + enabled flag), the
// comparison sampler ('less-equal', matching the GL PCF's `current <= closest`), and a 1x1 dummy depth
// texture for the no-shadow case, then rewrites the uniform every call (matrix + enabled from
// scene.shadow) and rebuilds the bind group only when the bound depth view changes (present ↔ absent).
// A shadow-less scene still renders: the dummy view is bound and the shader's `enabled < 0.5` early-out
// keeps it unsampled — mirroring GL's u_shadowEnabled = 0 path.
export function ensureWgpuShadowSampleBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const device = state.device;

  if (scene.shadowUniformBuffer === null) {
    scene.shadowUniformBuffer = device.createBuffer({
      size: SHADOW_SAMPLE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.shadowComparisonSampler === null) {
    scene.shadowComparisonSampler = device.createSampler({ compare: 'less-equal' });
  }
  if (scene.shadowDummyView === null) {
    // A 1x1 sampleable depth texture bound when no shadow map exists this frame; never actually sampled
    // (the enabled flag gates it off), it only satisfies the group(3) texture_depth_2d slot.
    scene.shadowDummyTexture = device.createTexture({
      size: [1, 1, 1],
      format: SHADOW_DEPTH_FORMAT,
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    scene.shadowDummyView = scene.shadowDummyTexture.createView();
  }

  const shadow = writeWgpuShadowSampleUniform(state);

  const view = shadow !== null ? shadow.depthView : scene.shadowDummyView;
  if (scene.shadowSampleBindGroup === null || scene.shadowSampleView !== view) {
    scene.shadowSampleBindGroup = device.createBindGroup({
      layout: ensureWgpuShadowSampleLayout(state),
      entries: [
        { binding: 0, resource: { buffer: scene.shadowUniformBuffer } },
        { binding: 1, resource: view },
        { binding: 2, resource: scene.shadowComparisonSampler },
      ],
    });
    scene.shadowSampleView = view;
  }
  return scene.shadowSampleBindGroup;
}

// Resolves the shared group(3) shadow-sample bind-group layout (uniform light matrix + enabled flag, a
// depth texture, and a comparison sampler), created once per state. Lit pipelines pass this to
// createWgpuMeshPipeline; the shared bind group built by ensureWgpuShadowSampleBindGroup targets it, so
// one shadow bind group serves every lit family's pipeline (pbr today).
export function ensureWgpuShadowSampleLayout(state: WgpuRenderState): GPUBindGroupLayout {
  const scene = getWgpuScene3DRuntime(state);
  if (scene.shadowSampleLayout === null) {
    scene.shadowSampleLayout = state.device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
      ],
    });
  }
  return scene.shadowSampleLayout;
}

// Writes the one shadow uniform shared by the combined PBR sample group and the standalone
// classic/toon shadow group. params = {enabled, pcfRadius, shadowBias, normalBiasWorld}; keeping this in one
// writer prevents the two binding paths from silently disagreeing about the same 80-byte ABI.
function writeWgpuShadowSampleUniform(state: WgpuRenderState): WgpuScene3DShadow | null {
  const scene = getWgpuScene3DRuntime(state);
  const shadow = scene.shadow;
  const values = _shadowSampleScratch;
  if (shadow !== null) {
    const matrix = shadow.matrix.m;
    for (let index = 0; index < 16; index++) values[index] = matrix[index];
    values[16] = shadow.enabled ? 1 : 0;
    values[17] = shadow.pcfRadius;
    values[18] = shadow.shadowBias;
    values[19] = shadow.normalBiasWorld;
  } else {
    for (let index = 0; index < 20; index++) values[index] = 0;
    values[0] = 1;
    values[5] = 1;
    values[10] = 1;
    values[15] = 1;
  }
  state.device.queue.writeBuffer(scene.shadowUniformBuffer!, 0, values.buffer, 0, SHADOW_SAMPLE_UNIFORM_BYTES);
  return shadow;
}

// Selects the ONE GPUSampler a material bind group uses, from its PRIMARY map's full sampler descriptor
// (the diffuse map for classic, the base-color map for PBR): wrap (a tiling repeat/mirror-repeat map
// gets the matching cached sampler so setTextureUvScale tiles), min/mag filter, a mip filter when the
// map requests a mip chain (paired with the mip chain generateWgpuMipmaps builds on upload), and
// anisotropy. A null/absent primary map falls back to the shared clamp sampler.
//
// SHARED-PRIMARY-SAMPLER CONTRACT (a deliberate wgpu↔GL divergence): the group(2) material layout carries
// a single sampler at binding 1 that the WGSL samples EVERY map (diffuse/specular/normal/alpha; base-
// color/metallic-roughness/normal/occlusion/emissive/alpha) through. So a non-primary map's per-Texture
// sampler is NOT honored on wgpu — only the primary map's. scene-gl, by contrast, binds each map with
// its own `map.sampler` (bindGlImageResourceTexture). This keeps the wgpu bind group to one sampler; a
// per-map-sampler wgpu path (one sampler binding per map) is a chartered later change, not a bug. The
// invalidation cache tracks this one sampler accordingly (see isWgpuMaterialBindGroupRebuildNeeded).
// Because a GPUSampler is immutable and baked into the cached bind group, this reads the descriptor at
// bind-group creation — the same lifetime as the resolved texture views.
export function getWgpuMaterialSampler(state: WgpuRenderState, texture: Readonly<Texture> | null): GPUSampler {
  if (texture === null) return getWgpuRenderStateDeviceResources(state).linearSampler;
  const sampler = texture.sampler;
  const minFilter: GPUFilterMode = sampler.minFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const magFilter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const useMips = sampler.mipmaps && sampler.minFilter !== 'linear' && sampler.minFilter !== 'nearest';
  const mipmapFilter: GPUMipmapFilterMode | undefined = useMips
    ? sampler.minFilter.endsWith('nearest')
      ? 'nearest'
      : 'linear'
    : undefined;
  return getWgpuSampler(state, minFilter, magFilter, sampler.wrapU, sampler.wrapV, mipmapFilter, sampler.anisotropy);
}

// Produces the distinct HAS_SKIN vertex variant. The palette stays in group(1), beside Draw, so lit
// pipelines still fit WebGPU's minimum four bind groups. Rigid source carries neither skin attributes
// nor the palette binding.
export function getWgpuMeshPreludeWgsl(
  skinned: boolean,
  skinning: Readonly<WgpuSkinningAdapter> | null = null,
): string {
  return skinned && skinning !== null ? skinning.extendMeshPrelude(WGPU_MESH_PRELUDE_WGSL) : WGPU_MESH_PRELUDE_WGSL;
}

// Builds a render pipeline for a family: compiles its WGSL module, and lays out [shared Frame, shared
// Draw, family Material] over the canonical 48-byte PBR vertex. Depth-stencil is depth24plus-stencil8,
// compare 'less', depth-write on (the scene pass owns depth; stencil inert); culling is back-face
// unless doubleSided. The family passes its own materialBindGroupLayout + entry points (default
// vs_main/fs_main). A lit family that PCF-samples the directional shadow map passes the shared
// group(3) `shadowBindGroupLayout` (ensureWgpuShadowSampleLayout), which extends the pipeline layout to
// [Frame, Draw, Material, Shadow] and flags the pipeline so beginWgpuMeshDraw binds group(3). A custom
// family may instead pass `extraBindGroupLayout`; it occupies group(3), but the family binds it itself.
export function initializeWgpuMeshPipeline(
  out: EntityConstruction<WgpuMeshPipeline>,
  state: WgpuRenderState,
  options: Readonly<{
    blended?: boolean;
    doubleSided: boolean;
    extraBindGroupLayout?: GPUBindGroupLayout;
    format: GPUTextureFormat;
    iblBindGroupLayout?: GPUBindGroupLayout;
    materialBindGroupLayout: GPUBindGroupLayout;
    module: GPUShaderModule;
    pbrSampleBindGroupLayout?: GPUBindGroupLayout;
    shadowBindGroupLayout?: GPUBindGroupLayout;
    skinned?: boolean;
    topology?: GPUPrimitiveTopology;
  }>,
): void {
  const device = state.device;
  const layouts = ensureWgpuScene3DLayouts(state);
  const sceneRuntime = getWgpuScene3DRuntime(state);
  const skinning = sceneRuntime.skinningAdapter as WgpuSkinningAdapter | null;
  const blendMode = options.blended ? (sceneRuntime.activeBlendMode ?? BlendMode.Normal) : null;
  const bindGroupLayouts: GPUBindGroupLayout[] = [
    layouts.frameBindGroupLayout,
    options.skinned && skinning !== null ? skinning.getMeshDrawLayout(state) : layouts.drawBindGroupLayout,
    options.materialBindGroupLayout,
  ];
  if (options.extraBindGroupLayout !== undefined) {
    bindGroupLayouts.push(options.extraBindGroupLayout);
  }
  if (options.extraBindGroupLayout === undefined && options.pbrSampleBindGroupLayout !== undefined) {
    bindGroupLayouts.push(options.pbrSampleBindGroupLayout);
  } else if (options.extraBindGroupLayout === undefined) {
    // Group order is positional: shadow (group 3) then IBL (group 4). Prefer pbrSampleBindGroupLayout
    // for new PBR pipelines so they fit WebGPU's minimum maxBindGroups=4.
    if (options.shadowBindGroupLayout !== undefined) bindGroupLayouts.push(options.shadowBindGroupLayout);
    if (options.iblBindGroupLayout !== undefined) bindGroupLayouts.push(options.iblBindGroupLayout);
  }
  const layout = device.createPipelineLayout({ bindGroupLayouts });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: {
      module: options.module,
      entryPoint: 'vs_main',
      buffers:
        options.skinned && skinning !== null
          ? [...skinning.vertexBufferLayouts, INSTANCE_BUFFER_LAYOUT]
          : [...VERTEX_BUFFER_LAYOUTS, INSTANCE_BUFFER_LAYOUT],
    },
    fragment: {
      module: options.module,
      entryPoint: 'fs_main',
      targets: [
        {
          format: options.format,
          blend: blendMode === null ? undefined : getWgpuBlendState(blendMode),
        },
      ],
    },
    primitive: {
      topology: options.topology ?? 'triangle-list',
      frontFace: 'ccw',
      cullMode: options.doubleSided ? 'none' : 'back',
    },
    depthStencil: { format: DEPTH_STENCIL_FORMAT, depthWriteEnabled: !options.blended, depthCompare: 'less' },
  });
  out.hasIblGroup = options.iblBindGroupLayout !== undefined;
  out.hasPbrSampleGroup = options.pbrSampleBindGroupLayout !== undefined;
  out.hasShadowGroup = options.shadowBindGroupLayout !== undefined;
  out.materialBindGroupLayout = options.materialBindGroupLayout;
  out.pipeline = pipeline;
  out.skinned = options.skinned === true;
}

// Whether a cached material binding must rebuild its GPUBindGroup because a freshly-resolved view or the
// primary sampler no longer matches what it was built from. `resolveWgpuMaterialTextureView` is the
// invalidation seam: a map swap, an unready→ready transition, a ready→ready image replacement, or an
// Image version bump each yield a different view identity, so identity comparison alone catches
// every live material-map mutation with no parallel epoch bookkeeping. `sampler` is the shared primary
// sampler (getWgpuMaterialSampler of the diffuse/base-color map), so a change to the primary map's
// sampler trips a rebuild; a non-primary map's per-Texture sampler is not bound and does not (the
// shared-primary-sampler contract). A binding with no cached views always rebuilds. Allocation-free —
// callers pass a reused scratch as `views`.
export function isWgpuMaterialBindGroupRebuildNeeded(
  binding: Readonly<WgpuMaterialBinding>,
  sampler: GPUSampler,
  views: readonly GPUTextureView[],
): boolean {
  if (binding.sampler !== sampler) return true;
  const cached = binding.views;
  if (cached === undefined || cached.length !== views.length) return true;
  for (let i = 0; i < views.length; i++) {
    if (cached[i] !== views[i]) return true;
  }
  return false;
}

// True when a material map declares a backing. Resolution may still yield null while an image,
// dynamic, or render-target source is not ready; bind helpers substitute the shared placeholder then.
export function isWgpuTextureReady(texture: Readonly<Texture> | null): boolean {
  return texture !== null && hasTextureSource(texture);
}

// Resolves the GPUTextureView a family binds into a material map slot: the real uploaded view when the
// resolver returns a view (cached per state by the backing implementation), otherwise the shared 1x1
// opaque-white placeholder so the bind-group layout's texture slot is always satisfied. The single
// texture-resolution seam every scene-wgpu family routes its maps through.
export function resolveWgpuMaterialTextureView(
  state: WgpuRenderState,
  texture: Readonly<Texture> | null,
): GPUTextureView {
  return (
    (texture !== null ? resolveWgpuTexture(state, texture)?.view : null) ?? ensureWgpuPlaceholderTextureView(state)
  );
}

// Splices the registered backend chunk and its affine or full-matrix vectors into a promoted 3D Draw uniform.
// Family compilers call this only for presence-selected variants; base source never imports or owns
// the feature chunk. Even the widened full-matrix struct fits the existing 256-byte Draw ring slot.
export function spliceWgpuColorAdjustmentPrelude(
  source: string,
  feature: Readonly<WgpuColorAdjustmentMaterialFeature>,
  matrix = false,
): string {
  const fields = matrix
    ? `  flightColorMatrix0 : vec4f,
  flightColorMatrix1 : vec4f,
  flightColorMatrix2 : vec4f,
  flightColorMatrix3 : vec4f,
  flightColorMatrixOffset : vec4f,`
    : `  flightColorScale : vec4f,
  flightColorBias : vec4f,`;
  return (
    (matrix ? feature.matrixFragmentShaderChunk : feature.fragmentShaderChunk) +
    source.replace(
      '  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag',
      `  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag
${fields}`,
    )
  );
}

// Stashes a material's primary-texture uv transform for the next writeWgpuDrawUniform to fold into the
// shared Draw uniform. A family's bind() calls this with its base/diffuse map; writeWgpuDrawUniform
// consumes and resets the stash so a following draw whose family does not stash gets the untiled uv.
// @flighthq/texture composes the KHR transform column-major, the layout WGSL reads, matching the CPU
// transformTextureUv reference. A null / identity / unbound texture leaves the stash at identity (the
// vs_main multiply then reproduces the raw uv).
export function stashWgpuUvTransform(state: WgpuRenderState, texture: Readonly<TextureLike> | null): void {
  const out = getWgpuScene3DRuntime(state).pendingUvTransform;
  if (texture === null || ('storage' in texture && !hasTextureSource(texture)) || !hasTextureUvTransform(texture)) {
    resetWgpuUvTransformStash(out);
    return;
  }
  getTextureUvMatrix(scratchUvMatrix, texture);
  const m = scratchUvMatrix.m;
  for (let i = 0; i < 9; i++) out[i] = m[i];
}

export function wgpuPerMapMaterialBindGroupNeedsRebuild(
  binding: Readonly<WgpuMaterialBinding>,
  samplers: readonly GPUSampler[],
  views: readonly GPUTextureView[],
): boolean {
  if (samplers.length !== views.length) return true;
  const cachedSamplers = binding.samplers;
  const cachedViews = binding.views;
  if (
    cachedSamplers === undefined ||
    cachedViews === undefined ||
    cachedSamplers.length !== samplers.length ||
    cachedViews.length !== views.length
  ) {
    return true;
  }
  for (let i = 0; i < views.length; i++) {
    if (cachedSamplers[i] !== samplers[i] || cachedViews[i] !== views[i]) return true;
  }
  return false;
}

function overwriteIdentityCache<T extends 'samplers' | 'views'>(
  binding: WgpuMaterialBinding,
  key: T,
  values: T extends 'samplers' ? readonly GPUSampler[] : readonly GPUTextureView[],
): void {
  const cached = binding[key] as unknown[] | undefined;
  if (cached === undefined || cached.length !== values.length) {
    (binding[key] as unknown[] | undefined) = values.slice();
    return;
  }
  for (let i = 0; i < values.length; i++) cached[i] = values[i];
}

// Allocates a draw slot from the render-state's uniform ring buffer, writes the Draw uniform (world
// mat4x4f + normal mat3x3f padded to std140) into it, records the slot's byte offset on the scene
// runtime (the draw path passes it as the bind group's dynamic offset), and returns the shared
// dynamic-offset Draw bind group. Reusing the render-state ring keeps each subset draw to one ring
// slot, not a fresh buffer; submitWgpuRenderPass uploads the used ring region before submit. Mirrors
// the per-draw model/normal upload in scene-gl's drawGlMeshSubset.
export function writeWgpuDrawUniform(state: WgpuRenderState, proxy: Readonly<Scene3DRenderProxy>): GPUBindGroup {
  const scene = getWgpuScene3DRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);

  if (scene.drawBindGroup === null) {
    scene.drawBindGroup = state.device.createBindGroup({
      layout: ensureWgpuScene3DLayouts(state).drawBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: stateRuntime.uniformBuffer, size: DRAW_UNIFORM_BYTES } }],
    });
  }

  const offset = stateRuntime.uniformOffset;
  const floatOffset = offset / 4;
  const u = stateRuntime.uniformData;
  const world = proxy.worldMatrix.m;
  for (let i = 0; i < 16; i++) u[floatOffset + i] = world[i];

  // mat3x3f normal matrix: three vec3 columns each padded to vec4 (std140) → floats 16..27.
  const n = proxy.normalMatrix.m;
  u[floatOffset + 16] = n[0];
  u[floatOffset + 17] = n[1];
  u[floatOffset + 18] = n[2];
  u[floatOffset + 19] = 0;
  u[floatOffset + 20] = n[3];
  u[floatOffset + 21] = n[4];
  u[floatOffset + 22] = n[5];
  u[floatOffset + 23] = 0;
  u[floatOffset + 24] = n[6];
  u[floatOffset + 25] = n[7];
  u[floatOffset + 26] = n[8];
  u[floatOffset + 27] = 0;

  // mat3x3f uv transform: three vec3 columns each padded to vec4 (std140) → floats 28..39. The stash
  // (set by a family's bind() via stashWgpuUvTransform) is already column-major and PERSISTS across
  // draws — read, never reset here. drawWgpuScene3D binds once per material then draws many meshes, so the
  // transform must survive every draw under one bind, mirroring the persistent GL u_uvTransform uniform.
  // Every family's bind stashes authoritatively (its map, or identity for non-texturing families), so
  // switching materials always re-establishes the correct value and no stale transform leaks forward.
  const uv = scene.pendingUvTransform;
  u[floatOffset + 28] = uv[0];
  u[floatOffset + 29] = uv[1];
  u[floatOffset + 30] = uv[2];
  u[floatOffset + 31] = 0;
  u[floatOffset + 32] = uv[3];
  u[floatOffset + 33] = uv[4];
  u[floatOffset + 34] = uv[5];
  u[floatOffset + 35] = 0;
  u[floatOffset + 36] = uv[6];
  u[floatOffset + 37] = uv[7];
  u[floatOffset + 38] = uv[8];
  u[floatOffset + 39] = 0;
  u[floatOffset + 40] = proxy.alpha ?? 1;
  // y = whether this draw's fragment alpha is COVERAGE. Only glTF's 'blend' says so; 'opaque' ignores
  // the material's alpha and 'mask' resolves fully opaque at its cutoff. The tail reads it so the
  // premultiply cannot darken a surface nothing is compositing. Mirrors scene-gl's u_alphaIsCoverage.
  u[floatOffset + 41] = isWgpuMeshAlphaCoverage(proxy.material) ? 1 : 0;
  // z and w publish this draw's skin arena base texel indices — pose and normal. The palette upload sets
  // them; consuming them here and clearing them back to zero is what stops a rigid draw that follows a
  // skinned one from inheriting a base and sampling another skeleton's region.
  u[floatOffset + 42] = scene.pendingSkinPaletteBase;
  u[floatOffset + 43] = scene.pendingSkinNormalPaletteBase;
  scene.pendingSkinPaletteBase = 0;
  scene.pendingSkinNormalPaletteBase = 0;

  // The registered adjustment feature reuses the otherwise 256-byte-aligned Draw ring slot: a
  // promoted shader widens its Draw struct by these two vec4s, while an untinted draw performs no
  // writes and its lean shader does not declare or read them.
  const colorMatrix = proxy.colorMatrix;
  if (colorMatrix != null) {
    for (let row = 0; row < 4; row++) {
      const source = row * 5;
      const target = floatOffset + 44 + row * 4;
      u[target] = colorMatrix[source]!;
      u[target + 1] = colorMatrix[source + 1]!;
      u[target + 2] = colorMatrix[source + 2]!;
      u[target + 3] = colorMatrix[source + 3]!;
      u[floatOffset + 60 + row] = colorMatrix[source + 4]!;
    }
  } else if (proxy.colorScaleBias != null) {
    const colorScaleBias = proxy.colorScaleBias;
    u[floatOffset + 44] = colorScaleBias.redScale;
    u[floatOffset + 45] = colorScaleBias.greenScale;
    u[floatOffset + 46] = colorScaleBias.blueScale;
    u[floatOffset + 47] = colorScaleBias.alphaScale;
    u[floatOffset + 48] = colorScaleBias.redBias;
    u[floatOffset + 49] = colorScaleBias.greenBias;
    u[floatOffset + 50] = colorScaleBias.blueBias;
    u[floatOffset + 51] = colorScaleBias.alphaBias;
  }

  scene.pendingDrawOffset = offset;
  stateRuntime.uniformOffset += stateRuntime.uniformStride;
  return scene.drawBindGroup;
}

// The shared WGSL prelude every family module prepends after its const-flag block: the Frame + Draw
// uniform structs and their group(0)/group(1) bindings, the VertexOutput, the vs_main entry, and the
// vertex transform. A family appends its own group(2) Material block + fs_main. Keeping the Frame/
// Draw structs here keeps them in lockstep with writeWgpuFrameUniform / writeWgpuDrawUniform. Mirrors
// scene-gl's shared vertex body + GL_MESH_LIGHT_BLOCK_GLSL.
export const WGPU_MESH_PRELUDE_WGSL = /* wgsl */ `
const PI : f32 = 3.14159265359;
const MAX_FORWARD_LIGHTS : u32 = 4u;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,       // xyz = directional light travel direction; w = directionalCount
  directionalRadiance : vec4f,  // rgb = linear premultiplied radiance
  ambientRadiance : vec4f,      // rgb = linear premultiplied radiance; w = ambientCount
  view : mat4x4f,               // camera view matrix; rotates world normals into view space (matcap)
  // Punctual light arrays — layout mirrors Scene3DLightBlock.data (packScene3DLightBlock).
  //   point[i]      = pointLights[i*2+0]={pos.xyz,range}, [i*2+1]={radiance.rgb,invSqrRange}
  //   spot[i]       = spotLights[i*4+0..1] as point, [i*4+2]={dir.xyz,_}, [i*4+3]={cosInner,cosOuter,_,_}
  //   hemisphere[i] = hemisphereLights[i*3+0]={sky.rgb,_}, [i*3+1]={ground.rgb,_}, [i*3+2]={up.xyz,_}
  pointLights : array<vec4f, 8>,       // MAX_FORWARD_LIGHTS * 2
  spotLights : array<vec4f, 16>,       // MAX_FORWARD_LIGHTS * 4
  hemisphereLights : array<vec4f, 12>, // MAX_FORWARD_LIGHTS * 3
  punctualCounts : vec4f,              // x = pointCount, y = spotCount, z = hemisphereCount
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
  uvTransform : mat3x3f,   // KHR_texture_transform of the material's primary map (identity when unused)
  params : vec4f,          // x = resolved object alpha, y = alpha-is-coverage flag
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
  @location(4) @interpolate(flat) objectAlpha : f32,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
  @location(6) instanceModel0 : vec4f,
  @location(7) instanceModel1 : vec4f,
  @location(8) instanceModel2 : vec4f,
  @location(9) instanceModel3 : vec4f,
) -> VertexOutput {
  var out : VertexOutput;
  var localPosition = vec4f(position, 1.0);
  var localNormal = normal;
  var localTangent = tangent.xyz;
  let instanceModel = mat4x4f(instanceModel0, instanceModel1, instanceModel2, instanceModel3);
  localPosition = instanceModel * localPosition;
  let world = draw.world * localPosition;
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * localNormal;
  out.worldTangent = vec4f(draw.normalMatrix * localTangent, tangent.w);
  // Apply the material's KHR_texture_transform to the uv. draw.uvTransform is identity for an untiled
  // material (writeWgpuDrawUniform's default), so this is a no-op there — applied unconditionally rather
  // than behind a pipeline const because this vs_main is shared by every family (classic/unlit/toon/
  // matcap/debug/wireframe) and a const would have to thread through all of them; a per-vertex mat3
  // multiply is negligible. The scene-gl mirror gates the equivalent branch via its #ifdef variant.
  out.uv = (draw.uvTransform * vec3f(uv, 1.0)).xy;
  out.objectAlpha = draw.params.x;
  return out;
}

`;

// Writes the per-frame Frame uniform (camera view-projection + world position + the packed light
// block) into the scene runtime's Frame buffer and ensures the Frame bind group exists. The light
// block layout matches Scene3DLightBlock.data: directional { direction.xyz @0, radiance.rgb @4 } then
// ambient { radiance.rgb @8 }; the presence counts go into the lightDirection.w / ambientRadiance.w
// lanes the shader branches on. Camera3D world position is the translation of the inverse view matrix.
// Punctual light arrays (point/spot/hemisphere) follow the camera view matrix, mirroring the packed
// layout from Scene3DLightBlock.data; a final vec4f carries the three punctual counts. Shared by every
// family — lighting-independent families simply ignore the light lanes.
export function writeWgpuFrameUniform(
  state: WgpuRenderState,
  camera: Readonly<Camera3D>,
  lights: Readonly<Scene3DLightBlock>,
): void {
  const scene = getWgpuScene3DRuntime(state);
  let binding = scene.frameBindings.get(lights);
  if (binding === undefined) {
    const buffer = state.device.createBuffer({
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const bindGroup = state.device.createBindGroup({
      layout: ensureWgpuScene3DLayouts(state).frameBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer } }],
    });
    binding = { bindGroup, buffer };
    scene.frameBindings.set(lights, binding);
  }
  // beginWgpuMeshDraw binds these current aliases immediately after this write. Distinct light blocks
  // retain distinct buffers until command submission, so later binds cannot rewrite earlier draws.
  scene.frameBuffer = binding.buffer;
  scene.frameBindGroup = binding.bindGroup;
  const f = _frameScratch;

  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  getCamera3DViewProjectionMatrix4(scratchViewProjection, camera, aspect !== 0 ? aspect : 1);
  // Camera projection matrices use OpenGL's [-1, 1] NDC-Z convention. WebGPU clips Z to [0, 1],
  // so left-multiply the view-projection by the depth correction z' = 0.5z + 0.5w. In column-major
  // storage this replaces the Z row while preserving X, Y, and W. Shadow-map WGSL applies its own
  // equivalent correction and deliberately does not consume this frame uniform.
  const sourceVp = scratchViewProjection.m;
  const webGpuVp = scratchWebGpuViewProjection.m;
  webGpuVp.set(sourceVp);
  webGpuVp[2] = 0.5 * (sourceVp[2] + sourceVp[3]);
  webGpuVp[6] = 0.5 * (sourceVp[6] + sourceVp[7]);
  webGpuVp[10] = 0.5 * (sourceVp[10] + sourceVp[11]);
  webGpuVp[14] = 0.5 * (sourceVp[14] + sourceVp[15]);
  const vp = webGpuVp;
  for (let i = 0; i < 16; i++) f[i] = vp[i];

  // Delegates to the canonical eye-position primitive instead of inverting the view here. A view matrix
  // is orthonormal by contract, so the eye is -(Rᵀ·t) — a transpose, with no determinant and no
  // division, which cannot fail. Inverting a 4x4 to read three numbers out of it was both the slower
  // way and the only reason this write had a failure mode to report.
  getCamera3DPosition(scratchCameraPosition, camera);
  f[16] = scratchCameraPosition.x;
  f[17] = scratchCameraPosition.y;
  f[18] = scratchCameraPosition.z;
  f[19] = 0;

  const data = lights.data;
  f[20] = data[0];
  f[21] = data[1];
  f[22] = data[2];
  f[23] = lights.directionalCount;
  f[24] = data[4];
  f[25] = data[5];
  f[26] = data[6];
  f[27] = 0;
  f[28] = data[8];
  f[29] = data[9];
  f[30] = data[10];
  f[31] = lights.ambientCount;

  // Camera3D view matrix (floats 32..47): used by matcap to rotate the world-space normal into view
  // space. Lighting-independent families ignore these lanes; the cost is one extra mat4 per frame.
  const view = camera.view.m;
  for (let i = 0; i < 16; i++) f[32 + i] = view[i];

  // Punctual light arrays (floats 48..) — the point/spot/hemisphere slices from Scene3DLightBlock.data
  // (identical packed layout), followed by a counts vec4f. Families that shade punctual lights read
  // these; others simply ignore the trailing data.
  const pointFloats = SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
  for (let i = 0; i < pointFloats; i++) f[FRAME_POINT_OFFSET + i] = data[SCENE_LIGHT_POINT_OFFSET + i];

  const spotFloats = SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
  for (let i = 0; i < spotFloats; i++) f[FRAME_SPOT_OFFSET + i] = data[SCENE_LIGHT_SPOT_OFFSET + i];

  const hemisphereFloats = SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;
  for (let i = 0; i < hemisphereFloats; i++) f[FRAME_HEMISPHERE_OFFSET + i] = data[SCENE_LIGHT_HEMISPHERE_OFFSET + i];

  f[FRAME_COUNTS_OFFSET] = lights.pointCount;
  f[FRAME_COUNTS_OFFSET + 1] = lights.spotCount;
  f[FRAME_COUNTS_OFFSET + 2] = lights.hemisphereCount;
  f[FRAME_COUNTS_OFFSET + 3] = 0;

  state.device.queue.writeBuffer(binding.buffer, 0, f.buffer, 0, FRAME_UNIFORM_BYTES);
}

// Frame uniform float offsets for the punctual light arrays — the byte offset within the Frame buffer
// where each punctual array begins, used by writeWgpuFrameUniform to copy the packed data from
// Scene3DLightBlock.data into the right Frame buffer position. All offsets in FLOATS (multiply by 4
// for bytes). The head block (viewProjection + cameraPosition + directional + ambient + view) is 48
// floats, followed by point → spot → hemisphere → counts.
const FRAME_POINT_OFFSET = 48;
const FRAME_SPOT_OFFSET = FRAME_POINT_OFFSET + SCENE_LIGHT_POINT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_HEMISPHERE_OFFSET = FRAME_SPOT_OFFSET + SCENE_LIGHT_SPOT_STRIDE * MAX_FORWARD_LIGHTS;
const FRAME_COUNTS_OFFSET = FRAME_HEMISPHERE_OFFSET + SCENE_LIGHT_HEMISPHERE_STRIDE * MAX_FORWARD_LIGHTS;

// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraPosition (16) + vec4f lightDirection (16)
// + vec4f directionalRadiance (16) + vec4f ambientRadiance (16) + mat4x4f view (64) + point lights
// (8 * 16 = 128) + spot lights (16 * 16 = 256) + hemisphere lights (12 * 16 = 192) + counts vec4f
// (16) = 784 bytes / 196 floats.
const FRAME_UNIFORM_BYTES = (FRAME_COUNTS_OFFSET + 4) * 4;

// Draw uniform: mat4x4f world (64) + mat3x3f normalMatrix as 3 padded vec4 (48) + mat3x3f uvTransform as
// 3 padded vec4 (48) + vec4f params (16, x = resolved object alpha) = 176; the ring buffer rounds the
// per-slot stride up to the device's minUniformBufferOffsetAlignment.
// Base Draw occupies 176 bytes; affine adjustment uses 208 and a full matrix uses 256. All fit the same
// 256-byte-aligned ring slot, so the base path allocates no additional per-draw storage.
const DRAW_UNIFORM_BYTES = 256;

// Writes the column-major identity mat3 into a uv-transform stash buffer, the untiled default.
function resetWgpuUvTransformStash(out: Float32Array): void {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 0;
  out[4] = 1;
  out[5] = 0;
  out[6] = 0;
  out[7] = 0;
  out[8] = 1;
}

// Row-major uv matrix composed per stash, transposed into the column-major pendingUvTransform buffer.
const scratchUvMatrix = createMatrix3();

// The depth-stencil format the scene pass uses, matching render-wgpu's main-canvas / effect-target
// depth attachment.
const DEPTH_STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

// The sampleable depth format the directional shadow map (and its 1x1 no-shadow dummy) use. depth32float
// is bindable as a texture_depth_2d for the lit PCF comparison; drawWgpuScene3DShadowMap renders into it.
export const SHADOW_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

// Shared by the PBR, classic, and toon WGSL modules. The uniform's vec4 params mirror the single CPU
// writer above: x=enabled, y=integer PCF radius, z=normalized depth bias, w=world-space normal bias.
export const WGPU_DIRECTIONAL_SHADOW_WGSL = /* wgsl */ `
const MAX_DIRECTIONAL_SHADOW_PCF_RADIUS : i32 = ${MAX_DIRECTIONAL_SHADOW_PCF_RADIUS};

struct Shadow {
  matrix : mat4x4f,
  params : vec4f,
};

@group(3) @binding(0) var<uniform> shadow : Shadow;
@group(3) @binding(1) var shadowMap : texture_depth_2d;
@group(3) @binding(2) var shadowSampler : sampler_comparison;

// Directional shadow factor at a world position. The compile-time radius cap bounds fragment cost;
// radius 0 and 1 take dedicated one-tap and 3x3 paths, while radius 2 takes the bounded 5x5 path.
// Outside the frustum / disabled = lit.
fn compareDirectionalShadow(uv : vec2f, depthRef : f32) -> f32 {
  return textureSampleCompareLevel(shadowMap, shadowSampler, uv, depthRef);
}

fn sampleDirectionalShadow(worldPos : vec3f, geometricNormal : vec3f) -> f32 {
  if (shadow.params.x < 0.5) {
    return 1.0;
  }
  let biasedWorldPos = worldPos + geometricNormal * shadow.params.w;
  let clip = shadow.matrix * vec4f(biasedWorldPos, 1.0);
  let ndc = clip.xyz / clip.w;
  let uv = vec2f(ndc.x * 0.5 + 0.5, 1.0 - (ndc.y * 0.5 + 0.5));
  let depthRef = ndc.z * 0.5 + 0.5 - shadow.params.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || depthRef > 1.0) {
    return 1.0;
  }
  let radius = clamp(i32(shadow.params.y), 0, MAX_DIRECTIONAL_SHADOW_PCF_RADIUS);
  let texel = 1.0 / vec2f(textureDimensions(shadowMap, 0));
  if (radius == 0) {
    return compareDirectionalShadow(uv, depthRef);
  }

  var sum = 0.0;
  if (radius == 1) {
    for (var x = -1; x <= 1; x = x + 1) {
      for (var y = -1; y <= 1; y = y + 1) {
        let offset = vec2f(f32(x), f32(y)) * texel;
        sum = sum + compareDirectionalShadow(uv + offset, depthRef);
      }
    }
    return sum / 9.0;
  }
  for (var x = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; x = x + 1) {
    for (var y = -MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; y <= MAX_DIRECTIONAL_SHADOW_PCF_RADIUS; y = y + 1) {
      let offset = vec2f(f32(x), f32(y)) * texel;
      sum = sum + compareDirectionalShadow(uv + offset, depthRef);
    }
  }
  let diameter = f32(MAX_DIRECTIONAL_SHADOW_PCF_RADIUS * 2 + 1);
  return sum / (diameter * diameter);
}
`;

// Shadow-sample uniform: mat4x4f light matrix (64) + vec4f params (16) = 80 bytes / 20 floats.
const SHADOW_SAMPLE_UNIFORM_BYTES = 80;

// IBL-sample uniform: vec4f params (16, x = enabled, y = intensity, z = maxMip) = 16 bytes / 4 floats.
const IBL_SAMPLE_UNIFORM_BYTES = 16;

// The 1x1 no-IBL dummy cube + LUT format. A plain filterable 8-bit format satisfies the IBL `float`
// texture slots (the dummies are never sampled — the IBL uniform's enabled flag gates them off).
const IBL_DUMMY_FORMAT: GPUTextureFormat = 'rgba8unorm';

// Opaque-white 1x1 RGBA pixel for the shared placeholder map texture (untextured path).
const WHITE_PIXEL = new Uint8Array([255, 255, 255, 255]);

// The canonical interleaved 48-byte PBR vertex: position(float32x3) @0, normal(float32x3) @12,
// tangent(float32x4) @24, uv0(float32x2) @40. Matches the @location slots in the WGSL vs_main.
const VERTEX_BUFFER_LAYOUTS: GPUVertexBufferLayout[] = [
  {
    arrayStride: 48,
    attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x3' },
      { shaderLocation: 1, offset: 12, format: 'float32x3' },
      { shaderLocation: 2, offset: 24, format: 'float32x4' },
      { shaderLocation: 3, offset: 40, format: 'float32x2' },
    ],
  },
];

const INSTANCE_BUFFER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 64,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 6, offset: 0, format: 'float32x4' },
    { shaderLocation: 7, offset: 16, format: 'float32x4' },
    { shaderLocation: 8, offset: 32, format: 'float32x4' },
    { shaderLocation: 9, offset: 48, format: 'float32x4' },
  ],
};

const scratchViewProjection = createMatrix4();
const scratchWebGpuViewProjection = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
const _frameScratch = new Float32Array(FRAME_UNIFORM_BYTES / 4);
const _dynamicOffsets = new Uint32Array(1);
const _shadowSampleScratch = new Float32Array(SHADOW_SAMPLE_UNIFORM_BYTES / 4);
const _iblSampleScratch = new Float32Array(IBL_SAMPLE_UNIFORM_BYTES / 4);
