import { getCameraViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4, getMatrix4Position, inverseMatrix4 } from '@flighthq/geometry';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { Camera, MeshGeometry, SceneLightBlock, SceneRenderProxy, WgpuRenderState } from '@flighthq/types';

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
export interface WgpuMeshPipeline {
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
}

// Builds a render pipeline for a family: compiles its WGSL module, and lays out [shared Frame, shared
// Draw, family Material] over the canonical 48-byte PBR vertex. Depth-stencil is depth24plus-stencil8,
// compare 'less', depth-write on (the scene pass owns depth; stencil inert); culling is back-face
// unless doubleSided. The family passes its own materialBindGroupLayout + entry points (default
// vs_main/fs_main).
export function createWgpuMeshPipeline(
  state: WgpuRenderState,
  options: Readonly<{
    doubleSided: boolean;
    format: GPUTextureFormat;
    materialBindGroupLayout: GPUBindGroupLayout;
    module: GPUShaderModule;
    topology?: GPUPrimitiveTopology;
  }>,
): WgpuMeshPipeline {
  const device = state.device;
  const layouts = ensureWgpuSceneLayouts(state);
  const layout = device.createPipelineLayout({
    bindGroupLayouts: [layouts.frameBindGroupLayout, layouts.drawBindGroupLayout, options.materialBindGroupLayout],
  });
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
  return { materialBindGroupLayout: options.materialBindGroupLayout, pipeline };
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

  scene.pendingDrawOffset = offset;
  stateRuntime.uniformOffset += stateRuntime.uniformStride;
  return scene.drawBindGroup;
}

// Writes the per-frame Frame uniform (camera view-projection + world position + the packed light
// block) into the scene runtime's Frame buffer and ensures the Frame bind group exists. The light
// block layout matches SceneLightBlock.data: directional { direction.xyz @0, radiance.rgb @4 } then
// ambient { radiance.rgb @8 }; the presence counts go into the lightDirection.w / ambientRadiance.w
// lanes the shader branches on. Camera world position is the translation of the inverse view matrix.
// Shared by every family — lighting-independent families simply ignore the light lanes.
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

  state.device.queue.writeBuffer(scene.frameBuffer!, 0, f.buffer, 0, FRAME_UNIFORM_BYTES);
}

// The shared WGSL prelude every family module prepends after its const-flag block: the Frame + Draw
// uniform structs and their group(0)/group(1) bindings, the VertexOutput, the vs_main entry, and the
// srgbToLinear helper. A family appends its own group(2) Material block + fs_main. Keeping the Frame/
// Draw structs here keeps them in lockstep with writeWgpuFrameUniform / writeWgpuDrawUniform. Mirrors
// scene-gl's shared vertex body + GL_MESH_LIGHT_BLOCK_GLSL.
export const WGPU_MESH_PRELUDE_WGSL = /* wgsl */ `
const PI : f32 = 3.14159265359;

struct Frame {
  viewProjection : mat4x4f,
  cameraPosition : vec4f,
  lightDirection : vec4f,       // xyz = directional light travel direction; w = directionalCount
  directionalRadiance : vec4f,  // rgb = linear premultiplied radiance
  ambientRadiance : vec4f,      // rgb = linear premultiplied radiance; w = ambientCount
};

struct Draw {
  world : mat4x4f,
  normalMatrix : mat3x3f,
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
  out.uv = uv;
  return out;
}

// sRgb albedo texels are gamma-encoded; decode to linear before lighting.
fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}
`;

// Frame uniform: mat4x4f viewProjection (64) + vec4f cameraPosition (16) + vec4f lightDirection (16)
// + vec4f directionalRadiance (16) + vec4f ambientRadiance (16) = 128 bytes / 32 floats.
const FRAME_UNIFORM_BYTES = 128;

// Draw uniform: mat4x4f world (64) + mat3x3f normalMatrix as 3 padded vec4 (48) = 112; the ring buffer
// rounds the per-slot stride up to the device's minUniformBufferOffsetAlignment.
const DRAW_UNIFORM_BYTES = 112;

// The depth-stencil format the scene pass uses, matching render-wgpu's main-canvas / effect-target
// depth attachment.
const DEPTH_STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

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
