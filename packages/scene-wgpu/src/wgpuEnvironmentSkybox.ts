import { getCamera3DInverseViewProjectionMatrix4 } from '@flighthq/camera';
import { createMatrix4 } from '@flighthq/geometry';
import { getWgpuRenderStateRuntime } from '@flighthq/render-wgpu';
import type { Camera3D, Environment, Matrix4, WgpuRenderState } from '@flighthq/types';

import { ensureWgpuEnvironmentSourceCube } from './wgpuEnvironmentCube';
import { getWgpuSceneRuntime } from './wgpuSceneRuntime';

// Draws the environment's radiance cubemap as the scene backdrop — the WGSL mirror of scene-gl's
// drawGlEnvironmentSkybox. A screen-filling triangle that, per pixel, reconstructs the world-space view
// ray from the inverse view-projection and samples the cube. The pipeline writes no depth and compares
// 'always', so it fills every pixel with the backdrop; call it once, inside the open scene render pass and
// BEFORE drawWgpuScene, so opaque geometry (depth-test LESS) draws over it. A no-op when the environment
// has no complete source cube or no render pass is open. `aspect` is the viewport width / height (matches
// the camera aspect drawWgpuScene uses). The ray reconstruction uses GL-convention clip Z (near -1, far
// +1) to match the camera's projection matrices — the same convention the mesh/shadow paths assume.
export function drawWgpuEnvironmentSkybox(
  state: WgpuRenderState,
  environment: Readonly<Environment>,
  camera: Readonly<Camera3D>,
  aspect: number,
): void {
  const cubeView = ensureWgpuEnvironmentSourceCube(state, environment);
  if (cubeView === null) return;

  const stateRuntime = getWgpuRenderStateRuntime(state);
  const pass = stateRuntime.renderPass;
  if (pass === null) return;

  const scene = getWgpuSceneRuntime(state);
  const format = stateRuntime.currentColorFormat ?? state.format;
  const sky = ensureWgpuSkyboxPipeline(state, format);

  getCamera3DInverseViewProjectionMatrix4(_inverseViewProjection, camera, aspect);
  const u = _skyScratch;
  const m = _inverseViewProjection.m;
  for (let i = 0; i < 16; i++) u[i] = m[i];
  u[16] = environment.intensity;
  u[17] = 0;
  u[18] = 0;
  u[19] = 0;
  state.device.queue.writeBuffer(sky.uniformBuffer, 0, u.buffer, 0, SKYBOX_UNIFORM_BYTES);

  // Rebuilt only when the bound source-cube view changes (a re-baked / swapped environment); the uniform
  // bind group is stable across frames for a static environment.
  if (sky.cubeBindGroup === null || sky.cubeView !== cubeView) {
    sky.cubeBindGroup = state.device.createBindGroup({
      layout: sky.cubeBindGroupLayout,
      entries: [
        { binding: 0, resource: cubeView },
        { binding: 1, resource: getWgpuSkyboxSampler(state) },
      ],
    });
    sky.cubeView = cubeView;
  }

  pass.setPipeline(sky.pipeline);
  pass.setBindGroup(0, sky.uniformBindGroup);
  pass.setBindGroup(1, sky.cubeBindGroup);
  pass.draw(3);
  void scene;
}

interface WgpuSkybox {
  cubeBindGroup: GPUBindGroup | null;
  cubeBindGroupLayout: GPUBindGroupLayout;
  cubeView: GPUTextureView | null;
  pipeline: GPURenderPipeline;
  uniformBindGroup: GPUBindGroup;
  uniformBuffer: GPUBuffer;
}

// Resolves (creating once per state + color format) the skybox pipeline: a fullscreen-triangle module, a
// group(0) uniform (inverse view-projection + intensity), and a group(1) cube texture + sampler. The
// pipeline declares the scene pass's depth-stencil format with depth-write off and compare 'always' so the
// backdrop never occludes geometry. Cached per (state, format) so the canvas (bgra8unorm) and the HDR
// effect target (rgba16float) get distinct variants — the WGSL mirror of scene-gl's ensureGlSkybox.
function ensureWgpuSkyboxPipeline(state: WgpuRenderState, format: GPUTextureFormat): WgpuSkybox {
  let byState = _skyboxes.get(state);
  if (byState === undefined) {
    byState = new Map();
    _skyboxes.set(state, byState);
  }
  let sky = byState.get(format);
  if (sky !== undefined) return sky;

  const device = state.device;
  const module = device.createShaderModule({ code: SKYBOX_WGSL });
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
  const cubeBindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float', viewDimension: 'cube' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const layout = device.createPipelineLayout({ bindGroupLayouts: [uniformBindGroupLayout, cubeBindGroupLayout] });
  const pipeline = device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
    depthStencil: { format: SKYBOX_DEPTH_STENCIL_FORMAT, depthWriteEnabled: false, depthCompare: 'always' },
  });
  const uniformBuffer = device.createBuffer({
    size: SKYBOX_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBindGroup = device.createBindGroup({
    layout: uniformBindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  sky = { cubeBindGroup: null, cubeBindGroupLayout, cubeView: null, pipeline, uniformBindGroup, uniformBuffer };
  byState.set(format, sky);
  return sky;
}

// The shared per-state filtering sampler for the skybox cube. Created once and reused across formats.
function getWgpuSkyboxSampler(state: WgpuRenderState): GPUSampler {
  let sampler = _skyboxSamplers.get(state);
  if (sampler === undefined) {
    sampler = state.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    _skyboxSamplers.set(state, sampler);
  }
  return sampler;
}

// The scene pass's depth-stencil format, matching wgpuMeshPipeline's DEPTH_STENCIL_FORMAT — the skybox
// pipeline must declare it to be compatible with the open scene render pass (it just never writes depth).
const SKYBOX_DEPTH_STENCIL_FORMAT: GPUTextureFormat = 'depth24plus-stencil8';

// Skybox uniform: mat4x4f inverse view-projection (64) + vec4f params (16, x = intensity) = 80 bytes.
const SKYBOX_UNIFORM_BYTES = 80;

const _inverseViewProjection: Matrix4 = createMatrix4();
const _skyScratch = new Float32Array(SKYBOX_UNIFORM_BYTES / 4);
const _skyboxes = new WeakMap<WgpuRenderState, Map<GPUTextureFormat, WgpuSkybox>>();
const _skyboxSamplers = new WeakMap<WgpuRenderState, GPUSampler>();

const SKYBOX_WGSL = /* wgsl */ `
struct SkyUniform {
  inverseViewProjection : mat4x4f,
  params : vec4f,   // x = intensity
};

@group(0) @binding(0) var<uniform> sky : SkyUniform;
@group(1) @binding(0) var envCube : texture_cube<f32>;
@group(1) @binding(1) var envSampler : sampler;

struct VertexOutput {
  @builtin(position) clipPosition : vec4f,
  @location(0) ndc : vec2f,
};

@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOutput {
  var out : VertexOutput;
  // Full-screen triangle from the vertex index alone (no vertex buffer).
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  out.ndc = vec2f(x, y);
  // Emit at the far plane (WebGPU clip z in 0..1) so the backdrop sits at maximum depth.
  out.clipPosition = vec4f(x, y, 1.0, 1.0);
  return out;
}

fn srgbToLinear(c : vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + vec3f(0.055)) / 1.055, vec3f(2.4));
  return select(lo, hi, c > vec3f(0.04045));
}

@fragment fn fs_main(in : VertexOutput) -> @location(0) vec4f {
  // Reconstruct the world-space ray through this pixel from the near- and far-plane unprojections. The
  // projection is GL-convention (clip z in -1..1), so unproject at z = -1 (near) and z = +1 (far),
  // matching scene-gl's skybox exactly.
  let nearW = sky.inverseViewProjection * vec4f(in.ndc, -1.0, 1.0);
  let farW = sky.inverseViewProjection * vec4f(in.ndc, 1.0, 1.0);
  let dir = normalize(farW.xyz / farW.w - nearW.xyz / nearW.w);
  let color = srgbToLinear(textureSampleLevel(envCube, envSampler, dir, 0.0).rgb) * sky.params.x;
  return vec4f(color, 1.0);
}
`;
