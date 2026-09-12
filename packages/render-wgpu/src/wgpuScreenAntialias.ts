import type { WgpuRenderState, WgpuScreenRenderTarget } from '@flighthq/types/contract';

import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime } from './wgpuRenderState';
import { syncWgpuScreenRenderTargetExtent } from './wgpuScreenRenderTarget';

// Turns on 2x-per-axis supersampling for a screen target: the frame draws into a 2x texture and one
// fullscreen linear-sampling pass resolves it into the swap chain immediately before submit. Each
// destination pixel center averages the corresponding 2x2 source texels, so this is a real resolve and
// not a post-hoc image filter, and every scene pipeline stays single-sampled — the seam is the surface,
// not the pipeline.
//
// Separately importable on purpose: a frame loop that never calls this pulls in neither the resolve
// pipeline nor its shader, which is most of what a screen target would otherwise cost.
export function enableWgpuScreenRenderTargetAntialias(target: WgpuScreenRenderTarget): void {
  target.antialias = true;
  target.acquireAntialiasView = acquireWgpuScreenRenderTargetAntialiasView;
  target.encodeAntialiasResolve = encodeWgpuScreenRenderTargetResolve;
  // The extent is physical storage, and the factor it is measured in just changed: re-sync now rather
  // than leaving width/height a frame behind the flag that scales them.
  syncWgpuScreenRenderTargetExtent(target);
}

function acquireWgpuScreenRenderTargetAntialiasView(
  state: WgpuRenderState,
  target: WgpuScreenRenderTarget,
): GPUTextureView {
  const width = target.width;
  const height = target.height;
  const maxDimension = target.device.limits.maxTextureDimension2D;
  if (width > maxDimension || height > maxDimension) {
    throw new Error(
      `enableWgpuScreenRenderTargetAntialias requires a ${width}x${height} supersample surface, exceeding maxTextureDimension2D ${maxDimension}.`,
    );
  }
  const existing = target.antialiasTexture;
  if (existing !== null && existing.width === width && existing.height === height) return target.antialiasView!;

  existing?.destroy();
  const texture = target.device.createTexture({
    size: [width, height, 1],
    format: target.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  target.antialiasTexture = texture;
  target.antialiasView = texture.createView();
  target.antialiasResolveBindGroup = target.device.createBindGroup({
    layout: ensureWgpuScreenAntialiasPipeline(state, target),
    entries: [
      { binding: 0, resource: target.antialiasView },
      { binding: 1, resource: getWgpuRenderStateDeviceResources(state).linearSampler },
    ],
  });
  return target.antialiasView;
}

function encodeWgpuScreenRenderTargetResolve(
  state: WgpuRenderState,
  target: Readonly<WgpuScreenRenderTarget>,
  encoder: GPUCommandEncoder,
): void {
  const presentationView = target.presentationView;
  const bindGroup = target.antialiasResolveBindGroup;
  const pipeline = getWgpuRenderStateRuntime(state).surfaceAntialiasResolvePipeline;
  if (presentationView === null || pipeline === null || bindGroup === null) return;

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

// The resolve pipeline is device-tier: every screen target on one device compiles it once and shares it.
// Returns the bind-group layout the caller's per-target bind group is built against.
function ensureWgpuScreenAntialiasPipeline(
  state: WgpuRenderState,
  target: Readonly<WgpuScreenRenderTarget>,
): GPUBindGroupLayout {
  const runtime = getWgpuRenderStateRuntime(state);
  const existing = runtime.surfaceAntialiasResolveBindGroupLayout;
  if (existing !== null && runtime.surfaceAntialiasResolvePipeline !== null) return existing;

  const bindGroupLayout = target.device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const layout = target.device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
  const module = target.device.createShaderModule({ code: SCREEN_ANTIALIAS_WGSL });
  runtime.surfaceAntialiasResolveBindGroupLayout = bindGroupLayout;
  runtime.surfaceAntialiasResolvePipeline = target.device.createRenderPipeline({
    layout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format: target.format }] },
    primitive: { topology: 'triangle-list' },
  });
  return bindGroupLayout;
}

const SCREEN_ANTIALIAS_WGSL = /* wgsl */ `
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
