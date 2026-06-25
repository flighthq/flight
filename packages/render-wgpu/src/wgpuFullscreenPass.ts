import type { WgpuFullscreenPipeline, WgpuRenderState, WgpuRenderTarget } from '@flighthq/types';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

// Creates a fullscreen-pass pipeline for the given fragment WGSL source and target format.
// The pipeline expects:
//   @group(0) @binding(0) — optional uniform buffer (if the shader declares it)
//   @group(1) @binding(i) — texture_2d<f32> input i, and a paired sampler at @binding(2i+1)
// `textureInputCount` controls how many input-texture bind group layouts are built.
export function createWgpuFullscreenPipeline(
  state: WgpuRenderState,
  fragmentWgsl: string,
  textureInputCount = 1,
  format: GPUTextureFormat = state.format,
): WgpuFullscreenPipeline {
  const { device } = state;
  const uniformBindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });
  const textureBindGroupLayouts: GPUBindGroupLayout[] = [];
  for (let i = 0; i < textureInputCount; i++) {
    textureBindGroupLayouts.push(
      device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        ],
      }),
    );
  }
  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [uniformBindGroupLayout, ...textureBindGroupLayouts],
  });
  const vsModule = device.createShaderModule({ code: FULLSCREEN_VERTEX_WGSL });
  const fsModule = device.createShaderModule({ code: fragmentWgsl });
  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module: vsModule, entryPoint: 'vs_main' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs_main',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });
  return { pipeline, pipelineLayout, uniformBindGroupLayout, textureBindGroupLayouts };
}

// Destroys a fullscreen pipeline's GPU resources. The pipeline and layouts are GC-managed in
// WebGPU and have no explicit destroy(); this function is a no-op but kept for API symmetry with
// createWgpuFullscreenPipeline and to signal that the caller should drop its reference.
export function destroyWgpuFullscreenPipeline(_state: WgpuRenderState, _pipeline: WgpuFullscreenPipeline): void {
  // WebGPU pipelines and layouts have no destroy() — they are GC-managed. Drop the reference
  // on the caller's side to allow collection.
}

// Draws a fullscreen pass into the current render target (or a provided explicit target).
// Binds `inputs[i]` as texture @group(1+i) @binding(0), calls `setUniforms` for per-pass
// uploads (pass null if the shader declares no uniforms), then draws 3 vertices.
//
// Requires an open render pass (renderWgpuBackground or beginWgpuRenderTarget must have been
// called first). When `dest` is null the current open pass is used as-is; when `dest` is
// provided, its bind group is set via the caller's render pass.
export function drawWgpuFullscreenPass(
  state: WgpuRenderState,
  wgpuPipeline: Readonly<WgpuFullscreenPipeline>,
  inputs: ReadonlyArray<Readonly<WgpuRenderTarget>>,
  dest: Readonly<WgpuRenderTarget> | null,
  setUniforms: ((state: WgpuRenderState, uniformBindGroupLayout: GPUBindGroupLayout) => GPUBindGroup) | null,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const pass = dest !== null ? runtime.renderPass : runtime.renderPass;
  if (pass === null) return;
  pass.setPipeline(wgpuPipeline.pipeline);
  if (setUniforms !== null) {
    const uniformBindGroup = setUniforms(state, wgpuPipeline.uniformBindGroupLayout);
    pass.setBindGroup(0, uniformBindGroup);
  }
  const runtime2 = getWgpuRenderStateRuntime(state);
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const layout = wgpuPipeline.textureBindGroupLayouts[i];
    if (layout === undefined) continue;
    const sampler = state.allowSmoothing ? runtime2.linearSampler : runtime2.nearestSampler;
    const bindGroup = state.device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: input.view },
        { binding: 1, resource: sampler },
      ],
    });
    pass.setBindGroup(1 + i, bindGroup);
  }
  pass.draw(3);
}

// The substrate-level WebGPU fullscreen-pass primitive. Filter and effect leaf packages draw
// through this; it is not filter-specific.
//
// The vertex shader generates a full-screen triangle from the vertex index alone (no vertex
// buffer needed): three vertices cover the clip space (-1..1 in both axes) with a single
// extra-large triangle. This avoids the clip-space seam that a quad with a diagonal would
// introduce and is the canonical WebGPU full-screen approach.
//
// Fragment shaders read input textures at @group(1) @binding(i) (one binding per input).
// An optional uniform buffer lives at @group(0) @binding(0) (set by the caller via setUniforms).
// Fragment shaders that take no uniforms may omit group 0 entirely.
const FULLSCREEN_VERTEX_WGSL = /* wgsl */ `
@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4f {
  // Full-screen triangle: three vertices covering the clip rect.
  let x = f32((vi & 1u) << 2u) - 1.0;
  let y = f32((vi & 2u) << 1u) - 1.0;
  return vec4f(x, y, 0.0, 1.0);
}
`;
