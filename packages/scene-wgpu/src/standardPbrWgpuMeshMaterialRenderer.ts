import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import type { LinearColor } from '@flighthq/materials';
import { unpackColorToLinear } from '@flighthq/materials';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type {
  Camera,
  Material,
  MeshGeometry,
  SceneLightBlock,
  SceneRenderProxy,
  StandardPbrMaterial,
  WgpuMeshMaterialRenderer,
  WgpuRenderState,
} from '@flighthq/types';

import { ensureWgpuMeshUpload } from './webgpuMeshUpload';
import type { WgpuPbrPipeline } from './webgpuPbrPipelineCache';
import { ensureWgpuPbrPipeline } from './webgpuPbrPipelineCache';
import type { WgpuPbrDefineKey } from './webgpuPbrPrelude';
import type { WgpuMaterialBinding } from './webgpuSceneRuntime';
import { getWgpuSceneRuntime } from './webgpuSceneRuntime';

// The built-in StandardPbr forward-lit mesh-material renderer (WgpuMeshMaterialRenderer for
// StandardPbrMaterialKind) — the WGSL mirror of standardPbrGlMeshMaterialRenderer. bind selects the
// pipeline variant for the material's maps/alpha mode + the current color-attachment format, writes
// the shared Frame uniform (camera view-projection + position, the packed light block) and binds it,
// then writes + binds the material's uniform/texture bind group. draw uploads the geometry's GPU
// buffers lazily (cached by geometry.version), writes the per-draw model + normal matrices into the
// render-state's uniform ring buffer, and issues the indexed draw over the proxy's subset. Depth-test
// LESS + depth-write on and back-face culling (unless double-sided) are baked on the pipeline. See
// registerStandardPbrWgpuMaterial to install it.
//
// Cannot be visually captured in JSDOM (no GPU adapter); the unit test asserts the pipeline/bind/draw
// call shape against the mock device, mirrored against the verified GL result.
export const standardPbrWgpuMeshMaterialRenderer: WgpuMeshMaterialRenderer = {
  bind(
    state: WgpuRenderState,
    material: Readonly<Material> | null,
    lights: Readonly<SceneLightBlock>,
    camera: Readonly<Camera>,
  ): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    if (pass === null) return;

    const scene = getWgpuSceneRuntime(state);
    const pbr = material as Readonly<StandardPbrMaterial> | null;
    const format = stateRuntime.currentColorFormat ?? state.format;
    const pipeline = ensureWgpuPbrPipeline(state, defineKeyForMaterial(pbr), format);
    scene.activePipeline = pipeline;

    writeFrameUniform(state, pipeline, camera, lights);
    const materialBindGroup = ensureMaterialBindGroup(state, pipeline, pbr);

    pass.setPipeline(pipeline.pipeline);
    pass.setBindGroup(0, scene.frameBindGroup!);
    pass.setBindGroup(2, materialBindGroup);
  },

  draw(state: WgpuRenderState, proxy: Readonly<SceneRenderProxy>, geometry: Readonly<MeshGeometry>): void {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const pass = stateRuntime.renderPass;
    const scene = getWgpuSceneRuntime(state);
    const pipeline = scene.activePipeline;
    if (pass === null || pipeline === null) return;

    const subset = proxy.subset;
    if (subset.indexCount === 0) return;

    const upload = ensureWgpuMeshUpload(state, geometry);
    if (upload === null || upload.indexBuffer === null) return;

    const drawBindGroup = writeDrawUniform(state, pipeline, proxy);
    _dynamicOffsets[0] = scene.pendingDrawOffset;

    pass.setBindGroup(1, drawBindGroup, _dynamicOffsets);
    pass.setVertexBuffer(0, upload.vertexBuffer);
    pass.setIndexBuffer(upload.indexBuffer, upload.indexFormat);
    pass.drawIndexed(subset.indexCount, 1, subset.indexOffset, 0, 0);
  },
};

// The feature define key for a StandardPbr material: which optional maps are present, the alpha-mask
// cutoff, and double-sidedness. Drives both the pipeline-cache variant and the bound textures. Mirrors
// scene-gl's defineKeyForMaterial; the proving slice's renderer binds placeholder maps, so the map
// flags stay off for materials with null maps.
function defineKeyForMaterial(material: Readonly<StandardPbrMaterial> | null): WgpuPbrDefineKey {
  return {
    alphaMaskEnabled: material !== null && material.alphaMode === 'mask',
    doubleSided: material !== null && material.doubleSided,
    hasBaseColorMap: false,
    hasNormalMap: false,
  };
}

// Builds (once per material reference) the Material uniform buffer + bind group and rewrites the
// uniform with this material's PBR factors each bind. The untextured slice binds the shared 1x1
// placeholder texture in every map slot so the bind-group layout matches the textured variant. A null
// material uses neutral PBR defaults (white, dielectric, fully rough).
function ensureMaterialBindGroup(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuPbrPipeline>,
  material: Readonly<StandardPbrMaterial> | null,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  const key = material ?? FALLBACK_MATERIAL;
  let binding: WgpuMaterialBinding | undefined = scene.materialBindGroups.get(key);
  if (binding === undefined) {
    const stateRuntime = getWgpuRenderStateRuntime(state);
    const buffer = state.device.createBuffer({
      size: MATERIAL_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const placeholder = ensurePlaceholderTextureView(state);
    const bindGroup = state.device.createBindGroup({
      layout: pipeline.materialBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer } },
        { binding: 1, resource: stateRuntime.linearSampler },
        { binding: 2, resource: placeholder },
        { binding: 3, resource: placeholder },
        { binding: 4, resource: placeholder },
        { binding: 5, resource: placeholder },
        { binding: 6, resource: placeholder },
      ],
    });
    binding = { bindGroup, buffer };
    scene.materialBindGroups.set(key, binding);
  }

  writeMaterialUniform(_materialScratch, material);
  state.device.queue.writeBuffer(binding.buffer, 0, _materialScratch.buffer, 0, MATERIAL_UNIFORM_BYTES);
  return binding.bindGroup;
}

// Lazily creates the per-state Frame uniform buffer + bind group on the scene runtime (shared across
// all StandardPbr draws on this state). Reuses the first pipeline variant's frame bind-group layout;
// every variant declares the same group(0) layout, so one bind group is valid for all of them.
function ensureFrameResources(state: WgpuRenderState, pipeline: Readonly<WgpuPbrPipeline>): void {
  const scene = getWgpuSceneRuntime(state);
  if (scene.frameBuffer === null) {
    scene.frameBuffer = state.device.createBuffer({
      size: FRAME_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }
  if (scene.frameBindGroup === null) {
    scene.frameBindGroup = state.device.createBindGroup({
      layout: pipeline.frameBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: scene.frameBuffer } }],
    });
  }
}

// The one-time opaque-white 1x1 RGBA texture view bound to every map slot in the untextured path, so
// the material bind-group layout matches the textured variant without uploading real maps.
function ensurePlaceholderTextureView(state: WgpuRenderState): GPUTextureView {
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

// Writes the per-frame Frame uniform (camera view-projection + world position + the packed light
// block) into the scene runtime's frame buffer and ensures the frame bind group exists. The light
// block layout (std140) matches SceneLightBlock.data: directional { direction.xyz @0, _pad,
// radiance.rgb @4, _pad } then ambient { radiance.rgb @8, _pad }; the presence counts go into the
// lightDirection.w / ambientRadiance.w lanes the shader branches on. Camera world position is the
// translation of the inverse view matrix (view is world->view).
function writeFrameUniform(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuPbrPipeline>,
  camera: Readonly<Camera>,
  lights: Readonly<SceneLightBlock>,
): void {
  ensureFrameResources(state, pipeline);
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

  state.device.queue.writeBuffer(scene.frameBuffer!, 0, f.buffer, 0, FRAME_UNIFORM_BYTES);
}

// Allocates a draw slot from the render-state's uniform ring buffer, writes the Draw uniform (world
// mat4x4f + normal mat3x3f padded to std140) into it, records the slot's byte offset on the scene
// runtime (the draw path passes it as the bind group's dynamic offset), and returns the shared
// dynamic-offset draw bind group. Reusing the render-state ring keeps each subset draw to one ring
// slot, not a fresh buffer; submitWgpuRenderPass uploads the used ring region before submit.
function writeDrawUniform(
  state: WgpuRenderState,
  pipeline: Readonly<WgpuPbrPipeline>,
  proxy: Readonly<SceneRenderProxy>,
): GPUBindGroup {
  const scene = getWgpuSceneRuntime(state);
  const stateRuntime = getWgpuRenderStateRuntime(state);

  if (scene.drawBindGroup === null) {
    scene.drawBindGroup = state.device.createBindGroup({
      layout: pipeline.drawBindGroupLayout,
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

  scene.pendingDrawOffset = offset;
  stateRuntime.uniformOffset += stateRuntime.uniformStride;
  return scene.drawBindGroup;
}

// Packs the StandardPbr material factors into the Material uniform scratch (must mirror the WGSL
// MaterialBlock): baseColor.rgba (linear), emissive.rgb*strength, factors (metallic, roughness,
// normalScale, occlusionStrength), flags (alphaCutoff, _, _, _). baseColor/emissive are sRgb-packed
// and converted to linear here so the shader stays in linear space. A null material uses neutral
// defaults (mirrors scene-gl's bindGlPbrMaterialUniforms null path).
function writeMaterialUniform(out: Float32Array, material: Readonly<StandardPbrMaterial> | null): void {
  if (material === null) {
    out[0] = 1;
    out[1] = 1;
    out[2] = 1;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 1;
    out[10] = 1;
    out[11] = 1;
    out[12] = 0.5;
    out[13] = 0;
    out[14] = 0;
    out[15] = 0;
    return;
  }

  unpackColorToLinear(_colorScratch, material.baseColor);
  out[0] = _colorScratch[0];
  out[1] = _colorScratch[1];
  out[2] = _colorScratch[2];
  out[3] = _colorScratch[3];

  unpackColorToLinear(_colorScratch, material.emissive);
  const strength = material.emissiveStrength;
  out[4] = _colorScratch[0] * strength;
  out[5] = _colorScratch[1] * strength;
  out[6] = _colorScratch[2] * strength;
  out[7] = 0;

  out[8] = material.metallic;
  out[9] = material.roughness;
  out[10] = material.normalScale;
  out[11] = material.occlusionStrength;

  out[12] = material.alphaCutoff;
  out[13] = 0;
  out[14] = 0;
  out[15] = 0;
}

// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraPosition (16) + vec4f lightDirection (16)
// + vec4f directionalRadiance (16) + vec4f ambientRadiance (16) = 128 bytes / 32 floats.
const FRAME_UNIFORM_BYTES = 128;

// Draw uniform: mat4x4f world (64) + mat3x3f normalMatrix as 3 padded vec4 (48) = 112; the ring
// buffer rounds the per-slot stride up to the device's minUniformBufferOffsetAlignment.
const DRAW_UNIFORM_BYTES = 112;

// Material uniform: baseColor vec4f (16) + emissive vec4f (16) + factors vec4f (16) + flags vec4f (16)
// = 64 bytes / 16 floats.
const MATERIAL_UNIFORM_BYTES = 64;

// Opaque-white 1x1 RGBA pixel for the placeholder map texture (untextured path).
const WHITE_PIXEL = new Uint8Array([255, 255, 255, 255]);

// A StandardPbrMaterial-shaped stand-in used as the material-bind-group cache key when bind is called
// with a null material (the DefaultMaterialKind fallback). Plain neutral PBR defaults; only used for
// identity in the WeakMap.
const FALLBACK_MATERIAL = {} as Readonly<StandardPbrMaterial>;

const scratchViewProjection = createMatrix4();
const scratchInverseView = createMatrix4();
const scratchCameraPosition = { x: 0, y: 0, z: 0 };
const _colorScratch: LinearColor = [0, 0, 0, 0];
const _dynamicOffsets = new Uint32Array(1);
const _frameScratch = new Float32Array(FRAME_UNIFORM_BYTES / 4);
const _materialScratch = new Float32Array(MATERIAL_UNIFORM_BYTES / 4);
