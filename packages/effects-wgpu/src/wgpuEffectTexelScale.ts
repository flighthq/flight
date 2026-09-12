import { getWgpuActiveRenderPass } from '@flighthq/render-wgpu/contract';
import type { WgpuRenderState, WgpuTextureRenderTarget } from '@flighthq/types/contract';

interface WgpuEffectLogicalResolution {
  readonly height: number;
  readonly texelsPerLogicalPixel: number;
  readonly width: number;
}

export function getWgpuEffectLogicalResolution(
  state: Readonly<WgpuRenderState>,
  target: Readonly<WgpuTextureRenderTarget>,
): WgpuEffectLogicalResolution {
  const texelsPerLogicalPixel = getWgpuRenderTargetTexelScale(target.width, getWgpuEffectLogicalWidth(state, target));
  return {
    height: target.height / texelsPerLogicalPixel,
    texelsPerLogicalPixel,
    width: target.width / texelsPerLogicalPixel,
  };
}

// The width one logical pixel is measured against: the open pass's viewport while a chain runs inside a
// frame, and the target's own width when it does not — the render-texture path writes into a target with
// no enclosing pass, and there logical and texel pixels coincide.
export function getWgpuEffectLogicalWidth(
  state: Readonly<WgpuRenderState>,
  target: Readonly<WgpuTextureRenderTarget>,
): number {
  return getWgpuActiveRenderPass(state as WgpuRenderState)?.viewport.width ?? target.width;
}

/**
 * Texels per logical canvas pixel in an effect target.
 *
 * WebGPU effect targets use two texels per axis at `sampleCount: 4`. Pool scratch targets retain those
 * enlarged dimensions while their own sample count is 1, so target-to-canvas dimensions are the reliable
 * signal. Use this for descriptor distances and patterns expressed in logical pixels; physical raster
 * kernels such as FXAA and SMAA must continue to use the actual target dimensions.
 */
export function getWgpuRenderTargetTexelScale(targetWidth: number, canvasWidth: number): number {
  if (!Number.isFinite(targetWidth) || !Number.isFinite(canvasWidth) || canvasWidth <= 0) return 1;
  return Math.max(1, Math.round(targetWidth / canvasWidth));
}
