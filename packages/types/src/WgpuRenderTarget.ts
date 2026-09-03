import type { Entity } from './Entity';
import type { RenderTargetColorSpace, RenderTargetDimensions } from './RenderTarget';
import type { WgpuTextureBindings } from './WgpuRenderState';

export interface WgpuRenderTarget extends RenderTargetDimensions, Entity {
  // Per-sampler bind groups over `view`, same contract as WgpuTextureEntry: which sampler a draw uses is
  // a draw policy re-read per draw, never captured into the target when it is allocated or resized.
  bindings: WgpuTextureBindings;
  // Declared color space of the target's content. A producer stamps linear 3D radiance as 'linear';
  // the final present reads this and applies the single linear-to-sRGB encode.
  colorSpace: RenderTargetColorSpace;
  depthStencilTexture: GPUTexture;
  // Render targets are always allocated single-level; declared so a target satisfies WgpuTextureResource.
  mipLevelCount: number;
  depthStencilView: GPUTextureView;
  // The color texture's GPU format. Defaults to the canvas format; an HDR effect target uses
  // 'rgba16float'. The pool matches reusable targets on this so an 8-bit and an HDR target never alias.
  format: GPUTextureFormat;
  height: number;
  // Effective coverage sample count. WGPU realizes four samples by rendering a 2x extent in each axis;
  // the target remains texture-sampleable so the existing presentation pass performs the resolve.
  sampleCount: number;
  // Clear policy resolved from creation: packed-RGBA (0xRRGGBBAA) per color attachment (empty == a
  // transparent clear, the render-target default) and the depth clear value. Read by beginWgpuRenderPass
  // to build the pass load op; fixed per target, since only the clear-or-keep choice varies per pass.
  clearColors: number[];
  clearDepth: number;
  texture: GPUTexture;
  view: GPUTextureView;
  width: number;
}

// A free-list of reusable targets. The effect pipeline owns one and lends intermediate targets to
// multi-pass recipes via acquireWgpuRenderTarget / releaseWgpuRenderTarget.
export type WgpuRenderTargetPool = Entity & {
  free: WgpuRenderTarget[];
};
