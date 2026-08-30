import type { WgpuPresentationRenderState, WgpuRenderState } from '@flighthq/types/contract';

import { getWgpuRenderStateRuntime } from './wgpuRenderState';

const SUPERSAMPLE_SCALE = 2;

// Redirects the main frame into a 2× texture view when surface antialiasing is enabled. The caller retains
// the presentation view so encodeWgpuSurfaceAntialiasResolve can downsample into it on the same encoder.
// Null means the normal direct-to-presentation path remains active.
export function acquireWgpuSurfaceAntialiasView(
  state: Readonly<WgpuPresentationRenderState>,
  presentationView: GPUTextureView,
): GPUTextureView | null {
  const runtime = getWgpuRenderStateRuntime(state);
  if (!runtime.surfaceAntialiasEnabled) {
    runtime.surfacePresentationView = null;
    return null;
  }

  const width = Math.max(1, state.surface.width) * SUPERSAMPLE_SCALE;
  const height = Math.max(1, state.surface.height) * SUPERSAMPLE_SCALE;
  const maxDimension = state.device.limits.maxTextureDimension2D;
  if (width > maxDimension || height > maxDimension) {
    throw new Error(
      `WgpuRenderOptions.antialias requires a ${width}x${height} supersample surface, exceeding maxTextureDimension2D ${maxDimension}.`,
    );
  }

  runtime.surfacePresentationView = presentationView;
  if (
    runtime.surfaceAntialiasTexture !== null &&
    runtime.surfaceAntialiasWidth === width &&
    runtime.surfaceAntialiasHeight === height
  ) {
    return runtime.surfaceAntialiasView;
  }

  runtime.surfaceAntialiasTexture?.destroy();
  const texture = state.device.createTexture({
    size: [width, height, 1],
    format: state.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  const view = texture.createView();
  runtime.surfaceAntialiasTexture = texture;
  runtime.surfaceAntialiasView = view;
  runtime.surfaceAntialiasWidth = width;
  runtime.surfaceAntialiasHeight = height;

  ensureWgpuSurfaceAntialiasPipeline(state);
  runtime.surfaceAntialiasResolveBindGroup = state.device.createBindGroup({
    layout: runtime.surfaceAntialiasResolveBindGroupLayout!,
    entries: [
      { binding: 0, resource: view },
      { binding: 1, resource: runtime.context.linearSampler },
    ],
  });
  return view;
}

export function clearWgpuSurfacePresentation(state: Readonly<WgpuPresentationRenderState>): void {
  getWgpuRenderStateRuntime(state).surfacePresentationView = null;
}

// Encodes the single surface resolve after every scene/effect/3D draw has completed and before capture
// readback. Linear sampling at each destination pixel center averages the corresponding 2×2 source
// texels, so this is a real supersample resolve rather than a post-capture image filter.
export function encodeWgpuSurfaceAntialiasResolve(
  state: Readonly<WgpuPresentationRenderState>,
  encoder: GPUCommandEncoder,
): void {
  const runtime = getWgpuRenderStateRuntime(state);
  const presentationView = runtime.surfacePresentationView;
  const pipeline = runtime.surfaceAntialiasResolvePipeline;
  const bindGroup = runtime.surfaceAntialiasResolveBindGroup;
  if (!runtime.surfaceAntialiasEnabled || presentationView === null || pipeline === null || bindGroup === null) return;

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: presentationView,
        loadOp: 'clear',
        storeOp: 'store',
        clearValue: { r: 0, g: 0, b: 0, a: 0 },
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(3);
  pass.end();
}

// Logical surface dimensions for descriptor/effect distances. Unlike getWgpuSurfaceRenderExtent this
// deliberately ignores the optional 2× presentation target; an explicit frame borrower receives the
// logical owner extent for the bounded session.
export function getWgpuSurfaceLogicalExtent(state: Readonly<WgpuRenderState>): { width: number; height: number } {
  if ('surface' in state) {
    const presentationState = state as WgpuPresentationRenderState;
    return { width: presentationState.surface.width, height: presentationState.surface.height };
  }
  const borrowed = getWgpuRenderStateRuntime(state).borrowedSurfaceExtent;
  if (borrowed !== null) return borrowed;
  throw new Error('A device-only WgpuRenderState has no logical surface extent outside an explicit frame borrow');
}

// The logical canvas dimensions remain the coordinate space used by 2D transforms. This helper is
// only for hardware viewport restoration after an offscreen target returns to the supersampled surface.
export function getWgpuSurfaceRenderExtent(state: Readonly<WgpuRenderState>): { width: number; height: number } {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.surfacePresentationView !== null) {
    return { width: runtime.surfaceAntialiasWidth, height: runtime.surfaceAntialiasHeight };
  }
  if ('surface' in state) {
    const presentationState = state as WgpuPresentationRenderState;
    return { width: presentationState.surface.width, height: presentationState.surface.height };
  }
  if (runtime.borrowedSurfaceExtent !== null) return runtime.borrowedSurfaceExtent;
  throw new Error('A device-only WgpuRenderState has no presentation extent outside an explicit frame borrow');
}

// Scissor rectangles are expressed in the logical main-surface coordinate space. Scale only while the
// active pass is the supersampled main surface; offscreen render targets retain their native extent.
export function getWgpuSurfaceRenderScale(state: Readonly<WgpuRenderState>): number {
  const runtime = getWgpuRenderStateRuntime(state);
  return runtime.currentRenderTarget === null && runtime.surfacePresentationView !== null ? SUPERSAMPLE_SCALE : 1;
}

function ensureWgpuSurfaceAntialiasPipeline(state: Readonly<WgpuPresentationRenderState>): void {
  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.surfaceAntialiasResolvePipeline !== null) return;

  const bindGroupLayout = state.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const layout = state.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const module = state.device.createShaderModule({ code: SURFACE_ANTIALIAS_WGSL });
  runtime.surfaceAntialiasResolveBindGroupLayout = bindGroupLayout;
  runtime.surfaceAntialiasResolvePipeline = state.device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: state.format }] },
    primitive: { topology: 'triangle-list' },
  });
}

const SURFACE_ANTIALIAS_WGSL = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let position = positions[index];
  var output: VertexOutput;
  output.position = vec4f(position, 0.0, 1.0);
  output.uv = position * vec2f(0.5, -0.5) + vec2f(0.5);
  return output;
}

@group(0) @binding(0) var source_texture: texture_2d<f32>;
@group(0) @binding(1) var source_sampler: sampler;

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  return textureSample(source_texture, source_sampler, input.uv);
}
`;
