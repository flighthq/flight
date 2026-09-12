import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  WgpuRenderState,
  WgpuRenderTarget,
  WgpuScreenRenderTarget,
  WgpuScreenRenderTargetOptions,
  WgpuScreenSurface,
} from '@flighthq/types/contract';

import { getWgpuHostBackend } from './wgpuHost';

// Acquires the color view a screen pass attaches to, sizing the target's storage to the surface first.
// The returned view is the supersample texture when antialiasing is enabled and the presentation view
// otherwise; either way `presentationView` names where the frame ultimately lands, so the submit can
// resolve and capture it. Internal: called by beginWgpuRenderPass.
export function bindWgpuScreenRenderTarget(state: WgpuRenderState, target: WgpuScreenRenderTarget): GPUTextureView {
  syncWgpuScreenRenderTargetExtent(target);
  ensureWgpuScreenRenderTargetDepthStencil(target);

  if (target.presentationView === null) {
    // With capture on, render into an offscreen COPY_SRC texture instead of the swap chain: software and
    // headless adapters never present the swap chain and its texture reads back as zeros, so the readable
    // copy must be the render target itself.
    const presentationTexture = target.acquireCaptureTexture?.(target) ?? target.context.getCurrentTexture();
    target.presentationView = presentationTexture.createView();
  }
  return target.acquireAntialiasView?.(state, target) ?? target.presentationView;
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
// its canvas context. The target is invalid afterward. The storage is freed here even though the code
// that filled it lives in the opt-in modules: a target owns its allocations whoever wrote to them.
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
  // The host owns how a surface yields a presentation context — the web adapter reaches for
  // getContext('webgpu'), a native host for its own swap chain — so the binding goes through the backend
  // rather than through a DOM call in the renderer.
  const format = options.format ?? 'bgra8unorm';
  const context = getWgpuHostBackend().attachSurface(surface, {
    alphaMode: options.alphaMode ?? 'premultiplied',
    device,
    format,
  });
  if (context === null) throw new Error('createWgpuScreenRenderTarget: the surface cannot present WebGPU.');

  const width = Math.max(1, surface.width);
  const height = Math.max(1, surface.height);
  const depthStencilTexture = createWgpuScreenDepthStencilTexture(device, width, height);

  out.acquireAntialiasView = null;
  out.acquireCaptureTexture = null;
  out.antialias = false;
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
  out.encodeAntialiasResolve = null;
  out.encodeCapture = null;
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

export function syncWgpuScreenRenderTargetExtent(target: WgpuScreenRenderTarget): void {
  const scale = target.antialias ? WGPU_SCREEN_SUPERSAMPLE_SCALE : 1;
  target.width = Math.max(1, target.surface.width) * scale;
  target.height = Math.max(1, target.surface.height) * scale;
}

function createWgpuScreenDepthStencilTexture(device: GPUDevice, width: number, height: number): GPUTexture {
  return device.createTexture({
    size: [Math.max(1, width), Math.max(1, height), 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
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

// Brings the target's extent back in line with its surface — the surface is the authority on its own
// size, and it can be resized between any two frames. Every pass calls this, so a caller never has to
// announce a resize; enabling supersampling calls it too, because the factor it multiplies by changed.
// One place decides how much bigger a supersampled surface is than its logical extent.
// wgpuTextureRenderTarget.ts carries the same number for offscreen storage; they are the same concept
// applied to two surfaces.
const WGPU_SCREEN_SUPERSAMPLE_SCALE = 2;
