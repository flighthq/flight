import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuScreenRenderTarget,
  WgpuScreenRenderTargetOptions,
  WgpuScreenSurface,
} from '@flighthq/types/contract';

import { getWgpuRenderStateDeviceResources, getWgpuRenderStateRuntime } from './wgpuRenderState';

// Acquires the color view a screen pass attaches to, sizing the target's storage to the surface first.
// The returned view is the supersample texture when antialiasing is on and the presentation view
// otherwise; either way `presentationView` names where the frame ultimately lands, so the submit can
// resolve and capture it. Internal: called by beginWgpuRenderPass.
export function bindWgpuScreenRenderTarget(state: WgpuRenderState, target: WgpuScreenRenderTarget): GPUTextureView {
  syncWgpuScreenRenderTargetExtent(target);
  ensureWgpuScreenRenderTargetDepthStencil(target);

  if (target.presentationView === null) {
    // With capture on, render into an offscreen COPY_SRC texture instead of the swap chain: software and
    // headless adapters never present the swap chain and its texture reads back as zeros, so the readable
    // copy must be the render target itself.
    const presentationTexture =
      acquireWgpuScreenRenderTargetCaptureTexture(target) ?? target.context.getCurrentTexture();
    target.presentationView = presentationTexture.createView();
  }
  if (!target.antialias) return target.presentationView;

  ensureWgpuScreenRenderTargetAntialias(state, target);
  return target.antialiasView!;
}

// A screen target's whole point is that it presents; a texture target's is that it can be sampled. Both
// creations are Entity allocations, so a factory is the only place either capability is decided.
export function createWgpuScreenRenderTarget(
  device: GPUDevice,
  surface: WgpuScreenSurface,
  options: Readonly<WgpuScreenRenderTargetOptions> = {},
): WgpuScreenRenderTarget {
  const out = allocateEntity<WgpuScreenRenderTarget>();
  initializeWgpuScreenRenderTarget(out, device, surface, options);
  return finishEntity(out);
}

// Frees the GPU storage this target owns — depth-stencil, supersample, and capture — and unconfigures
// its canvas context. The target is invalid afterward.
export function destroyWgpuScreenRenderTarget(target: WgpuScreenRenderTarget): void {
  target.depthStencilTexture.destroy();
  target.antialiasTexture?.destroy();
  target.antialiasTexture = null;
  target.antialiasView = null;
  target.antialiasResolveBindGroup = null;
  target.captureTexture?.destroy();
  target.captureTexture = null;
  target.captureBuffer?.destroy();
  target.captureBuffer = null;
  target.presentationView = null;
  target.context.unconfigure();
}

// Encodes the supersample resolve — one fullscreen linear-sampling pass whose destination pixel centers
// average the corresponding 2x2 source texels, so this is a real resolve and not a post-hoc image filter.
// No-op unless the target is antialiased. Internal: called by the frame submit, before capture reads back.
export function encodeWgpuScreenRenderTargetResolve(
  state: WgpuRenderState,
  target: Readonly<WgpuScreenRenderTarget>,
  encoder: GPUCommandEncoder,
): void {
  const presentationView = target.presentationView;
  const bindGroup = target.antialiasResolveBindGroup;
  const pipeline = getWgpuRenderStateRuntime(state).surfaceAntialiasResolvePipeline;
  if (!target.antialias || presentationView === null || pipeline === null || bindGroup === null) return;

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

// Releases the per-frame swap-chain view. The next frame acquires a fresh one, which is the whole reason
// a screen target is not sampleable: nothing may hold this across frames.
export function endWgpuScreenRenderTargetFrame(target: WgpuScreenRenderTarget): void {
  target.presentationView = null;
}

export function initializeWgpuScreenRenderTarget(
  out: EntityConstruction<WgpuScreenRenderTarget>,
  device: GPUDevice,
  surface: WgpuScreenSurface,
  options: Readonly<WgpuScreenRenderTargetOptions> = {},
): void {
  const context = surface.getContext('webgpu');
  if (context === null) throw new Error('createWgpuScreenRenderTarget: the surface has no WebGPU context.');

  const format = options.format ?? 'bgra8unorm';
  // COPY_SRC lets the swap-chain texture be read back with copyTextureToBuffer. It is the only reliable
  // way to read a Wgpu frame in headless/software contexts, and it also backs user-facing screenshots.
  context.configure({
    device,
    format,
    alphaMode: options.alphaMode ?? 'premultiplied',
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
  });

  const antialias = options.antialias ?? false;
  const scale = antialias ? WGPU_SCREEN_SUPERSAMPLE_SCALE : 1;
  const width = Math.max(1, surface.width) * scale;
  const height = Math.max(1, surface.height) * scale;
  const depthStencilTexture = createWgpuScreenDepthStencilTexture(device, width, height);

  out.antialias = antialias;
  out.antialiasResolveBindGroup = null;
  out.antialiasTexture = null;
  out.antialiasView = null;
  out.captureBuffer = null;
  out.captureBytesPerRow = 0;
  out.captureEnabled = false;
  out.captureHeight = 0;
  out.captureTexture = null;
  out.captureWidth = 0;
  out.colorAttachments = 1;
  out.colorSpace = options.colorSpace ?? 'srgb';
  out.context = context;
  out.depthStencilTexture = depthStencilTexture;
  out.depthStencilView = depthStencilTexture.createView();
  out.device = device;
  out.format = format;
  out.height = height;
  out.presentationView = null;
  out.sampleCount = 1;
  out.surface = surface;
  out.width = width;
}

// The base type says which storage a target names through `context`; this is the narrowing that reads it.
// Sampling, present, and effect-input APIs take WgpuTextureRenderTarget precisely so they never have to
// ask — the swap chain has no sampleable texture handle to give them.
export function isWgpuScreenRenderTarget(target: Readonly<WgpuRenderTarget>): target is WgpuScreenRenderTarget {
  return target.context !== null;
}

function acquireWgpuScreenRenderTargetCaptureTexture(target: WgpuScreenRenderTarget): GPUTexture | null {
  if (!target.captureEnabled) return null;

  const scale = target.antialias ? WGPU_SCREEN_SUPERSAMPLE_SCALE : 1;
  const width = Math.max(1, Math.floor(target.width / scale));
  const height = Math.max(1, Math.floor(target.height / scale));
  const existing = target.captureTexture;
  if (existing !== null && existing.width === width && existing.height === height) return existing;

  existing?.destroy();
  const texture = target.device.createTexture({
    size: [width, height, 1],
    format: target.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  target.captureTexture = texture;
  return texture;
}

function createWgpuScreenDepthStencilTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  return device.createTexture({
    size: [Math.max(1, width), Math.max(1, height), 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

function ensureWgpuScreenRenderTargetAntialias(state: WgpuRenderState, target: WgpuScreenRenderTarget): void {
  const width = target.width;
  const height = target.height;
  const maxDimension = target.device.limits.maxTextureDimension2D;
  if (width > maxDimension || height > maxDimension) {
    throw new Error(
      `WgpuScreenRenderTargetOptions.antialias requires a ${width}x${height} supersample surface, exceeding maxTextureDimension2D ${maxDimension}.`,
    );
  }
  if (
    target.antialiasTexture !== null &&
    target.antialiasTexture.width === width &&
    target.antialiasTexture.height === height
  ) {
    return;
  }

  target.antialiasTexture?.destroy();
  const texture = target.device.createTexture({
    size: [width, height, 1],
    format: target.format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
  target.antialiasTexture = texture;
  target.antialiasView = texture.createView();
  target.antialiasResolveBindGroup = target.device.createBindGroup({
    layout: ensureWgpuScreenRenderTargetResolvePipeline(state, target),
    entries: [
      { binding: 0, resource: target.antialiasView },
      { binding: 1, resource: getWgpuRenderStateDeviceResources(state).linearSampler },
    ],
  });
}

function ensureWgpuScreenRenderTargetDepthStencil(target: WgpuScreenRenderTarget): void {
  const texture = target.depthStencilTexture;
  if (texture.width === target.width && texture.height === target.height) return;

  texture.destroy();
  const replacement = createWgpuScreenDepthStencilTexture(target.device, target.width, target.height);
  target.depthStencilTexture = replacement;
  target.depthStencilView = replacement.createView();
}

// The resolve pipeline is device-tier: every screen target on one device compiles it once and shares it.
// Returns the bind-group layout the caller's per-target bind group is built against.
function ensureWgpuScreenRenderTargetResolvePipeline(
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

// The surface is the authority on its own size, and it can be resized between any two frames. Storage
// follows it here rather than at a resize* call, so a caller never has to remember to announce a resize.
function syncWgpuScreenRenderTargetExtent(target: WgpuScreenRenderTarget): void {
  const scale = target.antialias ? WGPU_SCREEN_SUPERSAMPLE_SCALE : 1;
  target.width = Math.max(1, target.surface.width) * scale;
  target.height = Math.max(1, target.surface.height) * scale;
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

// One place decides how much bigger a supersampled surface is than its logical extent.
// wgpuTextureRenderTarget.ts carries the same number for offscreen storage; they are the same concept
// applied to two surfaces.
const WGPU_SCREEN_SUPERSAMPLE_SCALE = 2;
