import type { WgpuRenderState, WgpuRenderTarget } from '@flighthq/types/contract';

interface WgpuEffectLogicalResolution {
  readonly height: number;
  readonly texelsPerLogicalPixel: number;
  readonly width: number;
}

export function getWgpuEffectLogicalResolution(
  state: Readonly<WgpuRenderState>,
  target: Readonly<WgpuRenderTarget>,
): WgpuEffectLogicalResolution {
  const texelsPerLogicalPixel = getWgpuRenderTargetTexelScale(target.width, state.canvas.width);
  return {
    height: target.height / texelsPerLogicalPixel,
    texelsPerLogicalPixel,
    width: target.width / texelsPerLogicalPixel,
  };
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
