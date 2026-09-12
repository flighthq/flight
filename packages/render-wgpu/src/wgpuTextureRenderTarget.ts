import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type {
  EntityConstruction,
  Material,
  Matrix,
  RenderTargetColorSpace,
  WgpuRenderState,
  WgpuTextureEntry,
  WgpuTextureRenderTarget,
} from '@flighthq/types/contract';

import { drawWgpuQuadWithTransform } from './wgpuDraw';
import { getWgpuRenderStateRuntime } from './wgpuRenderState';

export function createWgpuTextureRenderTarget(
  state: WgpuRenderState,
  width: number,
  height: number,
  format: GPUTextureFormat = state.format,
  colorSpace: RenderTargetColorSpace = 'srgb',
  sampleCount = 1,
): WgpuTextureRenderTarget {
  const out = allocateEntity<WgpuTextureRenderTarget>();
  initializeWgpuTextureRenderTarget(out, state, width, height, format, colorSpace, sampleCount);
  return finishEntity(out);
}

export function destroyWgpuTextureRenderTarget(_state: WgpuRenderState, target: WgpuTextureRenderTarget): void {
  target.texture.destroy();
  target.depthStencilTexture.destroy();
}

export function drawWgpuTextureRenderTargetResult(
  state: WgpuRenderState,
  renderProxy: {
    alpha: number;
    material: Material | null;
    transform2D: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  },
  target: Readonly<WgpuTextureRenderTarget>,
  transform: Readonly<Matrix>,
): void {
  if (target.width <= 0 || target.height <= 0) return;

  const runtime = getWgpuRenderStateRuntime(state);
  if (runtime.renderPass === null) return;

  // Compose the render node's transform with the cache offset transform
  const { a, b, c, d, tx, ty } = renderProxy.transform2D;
  const { a: ta, b: tb, c: tc, d: td, tx: ttx, ty: tty } = transform;
  const composedTransform = {
    a: a * ta + c * tb,
    b: b * ta + d * tb,
    c: a * tc + c * td,
    d: b * tc + d * td,
    tx: a * ttx + c * tty + tx,
    ty: b * ttx + d * tty + ty,
  };

  // Render target textures are stored with Y flipped relative to canvas (bottom-left origin)
  drawWgpuQuadWithTransform(
    state,
    renderProxy as never,
    composedTransform,
    (() => {
      const out = allocateEntity<WgpuTextureEntry>();
      out.bindings = target.bindings;
      out.mipLevelCount = target.mipLevelCount;
      out.texture = target.texture;
      out.view = target.view;
      return finishEntity(out);
    })(),
    0,
    0,
    target.width,
    target.height,
    0,
    1,
    1,
    0,
  );
}

// `format` defaults to the canvas format. Pass 'rgba16float' for an HDR effect target (bloom, tone
// mapping). The chosen format is recorded on the target so the effect-target pool matches on it.
export function initializeWgpuTextureRenderTarget(
  out: EntityConstruction<WgpuTextureRenderTarget>,
  state: WgpuRenderState,
  width: number,
  height: number,
  format: GPUTextureFormat = state.format,
  colorSpace: RenderTargetColorSpace = 'srgb',
  sampleCount = 1,
): void {
  const device = state.device;
  const resolved = resolveWgpuTextureRenderTargetExtent(width, height, sampleCount);
  const { height: h, sampleCount: samples, width: w } = resolved;
  const maxDimension = device.limits.maxTextureDimension2D;
  if (w > maxDimension || h > maxDimension) {
    throw new Error(
      `Wgpu render target sampleCount ${samples} requires a ${w}x${h} texture, exceeding maxTextureDimension2D ${maxDimension}.`,
    );
  }
  const texture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  const view = texture.createView();
  const depthStencilTexture = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  const depthStencilView = depthStencilTexture.createView();
  out.bindings = new Map();
  out.colorAttachments = 1;
  out.context = null;
  out.mipLevelCount = 1;
  out.colorSpace = colorSpace;
  out.texture = texture;
  out.view = view;
  out.depthStencilTexture = depthStencilTexture;
  out.depthStencilView = depthStencilView;
  out.format = format;
  out.sampleCount = samples;
  out.width = w;
  out.height = h;
}

export function resizeWgpuTextureRenderTarget(
  state: WgpuRenderState,
  target: WgpuTextureRenderTarget,
  width: number,
  height: number,
  sampleCount = target.sampleCount,
): void {
  const device = state.device;
  const format = target.format;
  const resolved = resolveWgpuTextureRenderTargetExtent(width, height, sampleCount);
  const { height: h, sampleCount: samples, width: w } = resolved;
  const maxDimension = device.limits.maxTextureDimension2D;
  if (w > maxDimension || h > maxDimension) {
    throw new Error(
      `Wgpu render target sampleCount ${samples} requires a ${w}x${h} texture, exceeding maxTextureDimension2D ${maxDimension}.`,
    );
  }
  if (w === target.width && h === target.height && samples === target.sampleCount) return;

  target.width = w;
  target.height = h;
  target.sampleCount = samples;

  target.texture.destroy();
  target.depthStencilTexture.destroy();

  const newTexture = device.createTexture({
    size: [w, h, 1],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
  });
  target.texture = newTexture;
  target.view = newTexture.createView();
  // Every cached bind group referenced the old view; drop them so they rebuild against the new one.
  target.bindings.clear();

  const newDepth = device.createTexture({
    size: [w, h, 1],
    format: 'depth24plus-stencil8',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  target.depthStencilTexture = newDepth;
  target.depthStencilView = newDepth.createView();
}

function resolveWgpuTextureRenderTargetExtent(
  width: number,
  height: number,
  sampleCount: number,
): { height: number; sampleCount: number; width: number } {
  const samples = sampleCount > 1 ? 4 : 1;
  const scale = samples === 4 ? WGPU_TEXTURE_RENDER_TARGET_SUPERSAMPLE_SCALE : 1;
  return {
    height: Math.max(1, Math.ceil(height)) * scale,
    sampleCount: samples,
    width: Math.max(1, Math.ceil(width)) * scale,
  };
}

// One place decides how much bigger a supersampled target is than its logical extent.
// wgpuScreenRenderTarget.ts carries the same number for the swap-chain surface; they are the same
// concept applied to two surfaces.
const WGPU_TEXTURE_RENDER_TARGET_SUPERSAMPLE_SCALE = 2;
