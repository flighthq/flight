import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix3, createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import { hasImageResourcePixels } from '@flighthq/image';
import { bindWgpuImageResourceTexture, getWgpuRenderStateRuntime, getWgpuSampler } from '@flighthq/render-wgpu';
import { getTextureUvMatrix, hasTextureUvTransform } from '@flighthq/texture';
import type {
  Camera,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  Texture,
  TextureLike,
  WgpuRenderState,
} from '@flighthq/types';
import {
  MAX_FORWARD_LIGHTS,
  SCENE_LIGHT_HEMISPHERE_OFFSET,
  SCENE_LIGHT_HEMISPHERE_STRIDE,
  SCENE_LIGHT_POINT_OFFSET,
  SCENE_LIGHT_POINT_STRIDE,
  SCENE_LIGHT_SPOT_OFFSET,
  SCENE_LIGHT_SPOT_STRIDE,
} from '@flighthq/types';

import { ensureWgpuMeshUpload } from './wgpuMeshUpload';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// The shared scene-wgpu mesh-pipeline infrastructure — the WGSL mirror of scene-gl's glMeshProgram +
// glLitProgram. Every mesh-material family compiles ONE render pipeline per (define key + color
// format) whose pipeline layout is [shared Frame layout, shared Draw layout, family Material layout].
// Frame (group 0: camera + light block) and Draw (group 1: per-draw world + normal matrix, dynamic
// offset) are identical across families, so their bind-group layouts, the Frame uniform buffer/bind
// group, and the dynamic-offset Draw bind group are created once per state and reused — only group 2
// (the material uniform + its maps) is family-specific. This keeps one Frame/Draw source of truth and
// lets one frame bind group serve every family's pipeline.

// A compiled mesh-material pipeline plus the material bind-group layout its group(2) targets. Frame and
// Draw layouts are shared on the runtime (see ensureWgpuSceneLayouts), so they are not stored here.
// `hasShadowGroup` is set when the pipeline was laid out with the group(3) shadow-sample layout (lit
// families that PCF-sample the directional shadow map); beginWgpuMeshDraw then also binds group(3).
export interface WgpuMeshPipeline {
  hasIblGroup: boolean;
  hasPbrSampleGroup: boolean;
  hasShadowGroup: boolean;
  materialBindGroupLayout: GPUBindGroupLayout;
  pipeline: GPURenderPipeline;
}

// The shared group(0)/group(1) bind-group layouts every family pipeline uses. Created once per state.
export interface WgpuSceneLayouts {
  drawBindGroupLayout: GPUBindGroupLayout;
  frameBindGroupLayout: GPUBindGroupLayout;
}

// Sets the family's pipeline active for the bind→draw handoff, binds it, and binds the shared Frame
// bind group at group(0). A family's bind() calls this after selecting its pipeline + writing the
// Frame uniform; draw() reads scene.activeMeshPipeline back. Mirrors scene-gl's beginGlMeshDraw.
export function beginWgpuMeshDraw(state: WgpuRenderState, pipeline: Readonly<WgpuMeshPipeline>): void {
  const stateRuntime = getWgpuRenderStateRuntime(state);
  const pass = stateRuntime.renderPass;
  if (pass === null) return;
  const scene = getWgpuSceneRuntime(state);
  scene.activeMeshPipeline = pipeline;
  pass.setPipeline(pipeline.pipeline);
  pass.setBindGroup(0, scene.frameBindGroup!);
  // Lit families that PCF-sample the directional shadow map carry a group(3) shadow layout; bind the
  // shared shadow-sample group (the real depth map when drawWgpuSceneShadowMap ran this frame, else a
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

// Builds a render pipeline for a family: compiles its WGSL module, and lays out [shared Frame, shared
// Draw, family Material] over the canonical 48-byte PBR vertex. Depth-stencil is depth24plus-stencil8,
// compare 'less', depth-write on (the scene pass owns depth; stencil inert); culling is back-face
// unless doubleSided. The family passes its own materialBindGroupLayout + entry points (default
// vs_main/fs_main). A lit family that PCF-samples the directional shadow map passes the shared
// group(3) `shadowBindGroupLayout` (ensureWgpuShadowSampleLayout), which extends the pipeline layout to
// [Frame, Draw, Material, Shadow] and flags the pipeline so beginWgpuMeshDraw binds group(3).
export function createWgpuMeshPipeline(
  state: WgpuRenderState,
  options: Readonly<{
    doubleSided: boolean;
    format: GPUTextureFormat;
    iblBindGroupLayout?: GPUBindGroupLayout;
    materialBindGroupLayout: GPUBindGroupLayout;
    module: GPUShaderModule;
    pbrSampleBindGroupLayout?: GPUBindGroupLayout;
    shadowBindGroupLayout?: GPUBindGroupLayout;
    topology?: GPUPrimitiveTopology;
  }>,
): WgpuMeshPipeline {
  const device = state.device;
  const layouts = ensureWgpuSceneLayouts(state);
  const bindGroupLayouts: GPUBindGroupLayout[] = [
    layouts.frameBindGroupLayout,
    layouts.drawBindGroupLayout,
    options.materialBindGroupLayout,
  ];
  if (options.pbrSampleBindGroupLayout !== undefined) {
    bindGroupLayouts.push(options.pbrSampleBindGroupLayout);
  } else {
    // Group order is positional: shadow (group 3) then IBL (group 4). Prefer pbrSampleBindGroupLayout
    // for new PBR pipelines so they fit WebGPU's minimum maxBindGroups=4.
    if (options.shadowBindGroupLayout !== undefined) bindGroupLayouts.push(options.shadowBindGroupLayout);
    if (options.iblBindGroupLayout !== undefined) bindGroupLayouts.push(options.iblBindGroupLayout);
  }
  const layout = device.createPipelineLayout({ bindGroupLayouts });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module: options.module, entryPoint: 'vs_main', buffers: VERTEX_BUFFER_LAYOUTS },
    fragment: { module: options.module, entryPoint: 'fs_main', targets: [{ format: options.format }] },
    primitive: {
      topology: options.topology ?? 'triangle-list',
      frontFace: 'ccw',
      cullMode: options.doubleSided ? 'none' : 'back',
    },
    depthStencil: { format: DEPTH_STENCIL_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
  });
  return {
    hasIblGroup: options.iblBindGroupLayout !== undefined,
    hasPbrSampleGroup: options.pbrSampleBindGroupLayout !== undefined,
    hasShadowGroup: options.shadowBindGroupLayout !== undefined,
    materialBindGroupLayout: options.materialBindGroupLayout,
    pipeline,
  };
}

// The shared per-draw tail for every mesh-material family: ring-allocates + writes the Draw uniform
// (world + normal matrix) for the proxy, lazily uploads the geometry's GPU buffers (cached by
// geometry.version), binds the dynamic-offset Draw group at group(1) + the vertex/index buffers, and
// issues the indexed draw over the proxy's subset. A family's draw() reads scene.activeMeshPipeline (set
// by beginWgpuMeshDraw) before calling this. Mirrors scene-gl's drawGlMeshSubset.
export function drawWgpuMeshSubset(
  state: WgpuRenderState,
  proxy: Readonly<SceneRenderProxy>,
  geometry: Readonly<MeshGeometry>,
): void {
  const stateRuntime = getWgpuRenderStateRuntime(state);
  const pass = stateRuntime.renderPass;
  const scene = getWgpuSceneRuntime(state);
  if (pass === null || scene.activeMeshPipeline === null) return;

  const subset = proxy.subset;
  if (subset.indexCount === 0) return;

  const upload = ensureWgpuMeshUpload(state, geometry);
  if (upload === null || upload.indexBuffer === null) return;

  const drawBindGroup = writeWgpuDrawUniform(state, proxy);
  _dynamicOffsets[0] = scene.pendingDrawOffset;

  pass.setBindGroup(1, drawBindGroup, _dynamicOffsets);
  pass.setVertexBuffer(0, upload.vertexBuffer);
  pass.setIndexBuffer(upload.indexBuffer, upload.indexFormat);
  pass.drawIndexed(subset.indexCount, 1, subset.indexOffset, 0, 0);
}

// Resolves the shared Frame bind group, creating it from the shared Frame layout + Frame buffer on
// first use. Every family pipeline declares the same group(0) layout, so this one bind group is valid
// for all of them.
export function ensureWgpuFrameBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  if (scene.frameBuffer === null) {
    scene.frameBuffer = state.device.createBuffer({
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.frameBindGroup === null) {
    scene.frameBindGroup = state.device.createBindGroup({
      layout: ensureWgpuSceneLayouts(state).frameBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: scene.frameBuffer } }],
    });
  }
  return scene.frameBindGroup;
}

// Resolves the shared IBL sample bind group a caller binds when its pipeline carries the
// legacy standalone IBL layout — the WGSL counterpart of scene-gl's IBL texture-unit + u_ibl* uniform binds in
// bindGlMeshLightBlock. Lazily creates the IBL uniform buffer (enabled/intensity/maxMip), a filtering
// sampler, and 1x1 dummy cube + 2D-LUT textures for the no-IBL case, then rewrites the uniform every call
// (from scene.ibl) and rebuilds the bind group only when the bound irradiance view changes (present ↔
// absent). A scene with no baked environment still renders: the dummy views are bound and the shader's
// `enabled < 0.5` gate keeps them unsampled — mirroring GL's u_iblEnabled = 0 placeholder path.
export function ensureWgpuIblSampleBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
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
  const scene = getWgpuSceneRuntime(state);
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

// Resolves the combined PBR sample bind group. WebGPU's required maxBindGroups minimum is 4, so PBR
// cannot afford separate shadow group(3) and IBL group(4). This layout packs both into group(3).
export function ensureWgpuPbrSampleBindGroup(state: WgpuRenderState): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
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

  const shadow = scene.shadow;
  const s = _shadowSampleScratch;
  if (shadow !== null) {
    const m = shadow.matrix.m;
    for (let i = 0; i < 16; i++) s[i] = m[i];
    s[16] = 1;
  } else {
    for (let i = 0; i < 16; i++) s[i] = 0;
    s[0] = 1;
    s[5] = 1;
    s[10] = 1;
    s[15] = 1;
    s[16] = 0;
  }
  s[17] = 0;
  s[18] = 0;
  s[19] = 0;
  device.queue.writeBuffer(scene.shadowUniformBuffer, 0, s.buffer, 0, SHADOW_SAMPLE_UNIFORM_BYTES);

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
  const scene = getWgpuSceneRuntime(state);
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

// The one-time opaque-white 1x1 RGBA texture view bound to a family's map slots in the untextured
// path, so a material bind-group layout that declares texture slots can be satisfied without uploading
// real maps. Shared across families (cached on the scene runtime).
export function ensureWgpuPlaceholderTextureView(state: WgpuRenderState): GPUTextureView {
  const scene = getWgpuSceneRuntime(state);
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
// uniform visible to the vertex stage (per-draw world + normal matrix).
export function ensureWgpuSceneLayouts(state: WgpuRenderState): WgpuSceneLayouts {
  const scene = getWgpuSceneRuntime(state);
  if (scene.frameBindGroupLayout === null || scene.drawBindGroupLayout === null) {
    const device = state.device;
    scene.frameBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    scene.drawBindGroupLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform', hasDynamicOffset: true } }],
    });
  }
  return { drawBindGroupLayout: scene.drawBindGroupLayout, frameBindGroupLayout: scene.frameBindGroupLayout };
}

// Resolves a compiled pipeline for a string cache key, compiling it via the factory on first use and
// caching it on the scene runtime's per-state pipelineCache. Every family routes its pipeline through
// this one cache; the key is namespaced by family + define key + color format (for example
// `unlit:bgra8unorm|-c-`), so families and feature/format variants compile at most once and never
// collide. Mirrors scene-gl's ensureGlSceneProgram.
export function ensureWgpuScenePipeline<T extends WgpuMeshPipeline>(
  state: WgpuRenderState,
  key: string,
  compile: () => T,
): T {
  const runtime = getWgpuSceneRuntime(state);
  let pipeline = runtime.pipelineCache.get(key);
  if (pipeline === undefined) {
    pipeline = compile();
    runtime.pipelineCache.set(key, pipeline);
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
  const scene = getWgpuSceneRuntime(state);
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

  const shadow = scene.shadow;
  const s = _shadowSampleScratch;
  if (shadow !== null) {
    const m = shadow.matrix.m;
    for (let i = 0; i < 16; i++) s[i] = m[i];
    s[16] = 1; // enabled
  } else {
    for (let i = 0; i < 16; i++) s[i] = 0;
    s[0] = 1;
    s[5] = 1;
    s[10] = 1;
    s[15] = 1; // identity
    s[16] = 0; // disabled
  }
  s[17] = 0;
  s[18] = 0;
  s[19] = 0;
  device.queue.writeBuffer(scene.shadowUniformBuffer, 0, s.buffer, 0, SHADOW_SAMPLE_UNIFORM_BYTES);

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
  const scene = getWgpuSceneRuntime(state);
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

// Selects the GPUSampler a material bind group uses from its primary map's full sampler descriptor:
// wrap (a tiling repeat/mirror-repeat map gets the matching cached sampler so setTextureUvScale tiles),
// min/mag filter, a mip filter when the map requests a mip chain (paired with the mip chain
// generateWgpuMipmaps builds on upload), and anisotropy — mirroring scene-gl's applyGlSamplerState. A
// null/absent map falls back to the shared clamp sampler. Because a GPUSampler is immutable and baked
// into the cached bind group, this reads the descriptor at bind-group creation — the same lifetime as
// the resolved texture views.
export function getWgpuMaterialSampler(state: WgpuRenderState, texture: Readonly<Texture> | null): GPUSampler {
  if (texture === null) return getWgpuRenderStateRuntime(state).linearSampler;
  const sampler = texture.sampler;
  const filter: GPUFilterMode = sampler.magFilter.startsWith('nearest') ? 'nearest' : 'linear';
  const useMips = sampler.mipmaps && sampler.minFilter !== 'linear' && sampler.minFilter !== 'nearest';
  const mipmapFilter: GPUMipmapFilterMode | undefined = useMips
    ? sampler.minFilter.endsWith('nearest')
      ? 'nearest'
      : 'linear'
    : undefined;
  return getWgpuSampler(state, filter, sampler.wrapU, sampler.wrapV, mipmapFilter, sampler.anisotropy);
}

// True when a material map texture is present AND carries GPU-uploadable pixels — an element or a data-only
// generated Surface. Families call this to decide the `has*Map` define flag — the textured pipeline variant
// compiles only when the map can actually be sampled, so an empty texture renders the untextured path.
// Mirrors the `map !== null && map.image !== null && hasImageResourcePixels(map.image)` guard in the GL renderers.
export function isWgpuTextureReady(texture: Readonly<Texture> | null): boolean {
  return texture !== null && texture.image !== null && hasImageResourcePixels(texture.image);
}

// Resolves the GPUTextureView a family binds into a material map slot: the real uploaded view when the
// texture carries pixels (cached per state by render-wgpu's resource texture cache), otherwise the shared
// 1x1 opaque-white placeholder so the bind-group layout's texture slot is always satisfied. The single
// texture-resolution seam every scene-wgpu family routes its maps through — the WGSL mirror of scene-gl's
// `bindGlImageResourceTexture(state, map.image)` / unbound-attribute fallback.
export function resolveWgpuMaterialTextureView(
  state: WgpuRenderState,
  texture: Readonly<Texture> | null,
): GPUTextureView {
  if (texture !== null && texture.image !== null && hasImageResourcePixels(texture.image)) {
    // Request a mip chain when the map's sampler asks for mipmaps, so getWgpuMaterialSampler's mip
    // filter has levels to sample; the shared placeholder and 2D path stay single-level.
    return bindWgpuImageResourceTexture(state, texture.image, texture.sampler.mipmaps).view;
  }
  return ensureWgpuPlaceholderTextureView(state);
}

// Stashes a material's primary-texture uv transform for the next writeWgpuDrawUniform to fold into the
// shared Draw uniform. A family's bind() calls this with its base/diffuse map; writeWgpuDrawUniform
// consumes and resets the stash so a following draw whose family does not stash gets the untiled uv.
// @flighthq/texture composes the KHR transform column-major, the layout WGSL reads, matching the CPU
// transformTextureUv reference. A null / identity / unbound texture leaves the stash at identity (the
// vs_main multiply then reproduces the raw uv).
export function stashWgpuUvTransform(state: WgpuRenderState, texture: Readonly<TextureLike> | null): void {
  const out = getWgpuSceneRuntime(state).pendingUvTransform;
  if (texture === null || texture.image === null || !hasTextureUvTransform(texture)) {
    resetWgpuUvTransformStash(out);
    return;
  }
  getTextureUvMatrix(scratchUvMatrix, texture);
  const m = scratchUvMatrix.m;
  for (let i = 0; i < 9; i++) out[i] = m[i];
}

// Allocates a draw slot from the render-state's uniform ring buffer, writes the Draw uniform (world
// mat4x4f + normal mat3x3f padded to std140) into it, records the slot's byte offset on the scene
// runtime (the draw path passes it as the bind group's dynamic offset), and returns the shared
// dynamic-offset Draw bind group. Reusing the render-state ring keeps each subset draw to one ring
// slot, not a fresh buffer; submitWgpuRenderPass uploads the used ring region before submit. Mirrors
// the per-draw model/normal upload in scene-gl's drawGlMeshSubset.
export function writeWgpuDrawUniform(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);

  if (scene.drawBindGroup === null) {
    scene.drawBindGroup = state.device.createBindGroup({
      layout: ensureWgpuSceneLayouts(state).drawBindGroupLayout,
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
  // draws — read, never reset here. drawWgpuScene binds once per material then draws many meshes, so the
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

  scene.pendingDrawOffset = offset;
  stateRuntime.uniformOffset += stateRuntime.uniformStride;
  return scene.drawBindGroup;
}

// Writes the per-frame Frame uniform (camera view-projection + world position + the packed light
// block) into the scene runtime's Frame buffer and ensures the Frame bind group exists. The light
// block layout matches SceneLightBlock.data: directional { direction.xyz @0, radiance.rgb @4 } then
// ambient { radiance.rgb @8 }; the presence counts go into the lightDirection.w / ambientRadiance.w
// lanes the shader branches on. Camera world position is the translation of the inverse view matrix.
// Punctual light arrays (point/spot/hemisphere) follow the camera view matrix, mirroring the packed
// layout from SceneLightBlock.data; a final vec4f carries the three punctual counts. Shared by every
// family — lighting-independent families simply ignore the light lanes.
export function writeWgpuFrameUniform(
  state: WgpuRenderState,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLightBlock>,
): void {
  ensureWgpuFrameBindGroup(state);
  const scene = getWgpuSceneRuntime(state);
  const f = _frameScratch;

  const aspect = camera.projection.kind === 'perspective' ? camera.projection.aspect : 1;
  getCameraViewProjectionMatrix4(scratchViewProjection, camera, aspect !== 0 ? aspect : 1);
  const vp = scratchViewProjection.m;
  for (let i = 0; i < 16; i++) f[i] = vp[i];

  inverseMatrix4(scratchInverseView, camera.view);
  getMatrix4Position(scratchCameraPosition, scratchInverseView);
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

  // Camera view matrix (floats 32..47): used by matcap to rotate the world-space normal into view
  // space. Lighting-independent families ignore these lanes; the cost is one extra mat4 per frame.
  const view = camera.view.m;
  for (let i = 0; i < 16; i++) f[32 + i] = view[i];

  // Punctual light arrays (floats 48..) — the point/spot/hemisphere slices from SceneLightBlock.data
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

  state.device.queue.writeBuffer(scene.frameBuffer!, 0, f.buffer, 0, FRAME_UNIFORM_BYTES);
}

// The shared WGSL prelude every family module prepends after its const-flag block: the Frame + Draw
// uniform structs and their group(0)/group(1) bindings, the VertexOutput, the vs_main entry, and the
// srgbToLinear helper. A family appends its own group(2) Material block + fs_main. Keeping the Frame/
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
  // Punctual light arrays — layout mirrors SceneLightBlock.data (packSceneLightBlock).
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
};

@group(0) @binding(0) var<uniform> frame : Frame;
@group(1) @binding(0) var<uniform> draw : Draw;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) worldPosition : vec3f,
  @location(1) worldNormal : vec3f,
  @location(2) worldTangent : vec4f,
  @location(3) uv : vec2f,
};

@vertex fn vs_main(
  @location(0) position : vec3f,
  @location(1) normal : vec3f,
  @location(2) tangent : vec4f,
  @location(3) uv : vec2f,
) -> VertexOutput {
  var out : VertexOutput;
  let world = draw.world * vec4f(position, 1.0);
  out.worldPosition = world.xyz;
  out.clipPosition = frame.viewProjection * world;
  out.worldNormal = draw.normalMatrix * normal;
  out.worldTangent = vec4f(draw.normalMatrix * tangent.xyz, tangent.w);
  // Apply the material's KHR_texture_transform to the uv. draw.uvTransform is identity for an untiled
  // material (writeWgpuDrawUniform's default), so this is a no-op there — applied unconditionally rather
  // than behind a pipeline const because this vs_main is shared by every family (classic/unlit/toon/
  // matcap/debug/wireframe) and a const would have to thread through all of them; a per-vertex mat3
  // multiply is negligible. The scene-gl mirror gates the equivalent branch via its #ifdef variant.
  out.uv = (draw.uvTransform * vec3f(uv, 1.0)).xy;
  return out;
}

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}
`;

// Frame uniform float offsets for the punctual light arrays — the byte offset within the Frame buffer
// where each punctual array begins, used by writeWgpuFrameUniform to copy the packed data from
// SceneLightBlock.data into the right Frame buffer position. All offsets in FLOATS (multiply by 4
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
// 3 padded vec4 (48) = 160; the ring buffer rounds the per-slot stride up to the device's
// minUniformBufferOffsetAlignment.
const DRAW_UNIFORM_BYTES = 160;

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
// is bindable as a texture_depth_2d for the lit PCF comparison; drawWgpuSceneShadowMap renders into it.
export const SHADOW_DEPTH_FORMAT: GPUTextureFormat = 'depth32float';

// Shadow-sample uniform: mat4x4f light matrix (64) + vec4f params (16, x = enabled) = 80 bytes / 20 floats.
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

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
const _frameScratch = new Float32Array(FRAME_UNIFORM_BYTES / 4);
const _dynamicOffsets = new Uint32Array(1);
const _shadowSampleScratch = new Float32Array(SHADOW_SAMPLE_UNIFORM_BYTES / 4);
const _iblSampleScratch = new Float32Array(IBL_SAMPLE_UNIFORM_BYTES / 4);
