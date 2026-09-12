import type { Entity } from './Entity';
import type { RenderTargetColorSpace, RenderTargetDimensions } from './RenderTarget';
import type { WgpuPresentationSurface } from './WgpuHost';
import type { WgpuTextureBindings } from './WgpuRenderState';

// What a Wgpu render pass needs in order to bind and clear a target, and nothing more. The two
// realizations differ in where the color pixels live: a screen target presents into a swap-chain
// texture acquired fresh each frame, a texture target owns sampleable storage. `context` is the field
// that says which — non-null exactly on a screen target, the Wgpu analogue of GlRenderTarget's
// nullable `framebuffer`. Use isWgpuScreenRenderTarget to narrow.
//
// `colorAttachments` is the DECLARED attachment count, not the length of a storage array: a screen
// target has one attachment and no textures array at all, so a clear that broadcasts one color
// iterates this rather than any storage.
//
// Fields are mutable because resize reallocates them in place; callers that must not mutate a target
// take it as Readonly<WgpuRenderTarget>.
export interface WgpuRenderTarget extends RenderTargetDimensions, Entity {
  colorAttachments: number;
  // Declared color space of the target's content. A producer stamps linear 3D radiance as 'linear';
  // the final present reads this and applies the single linear-to-sRGB encode.
  colorSpace: RenderTargetColorSpace;
  // The swap-chain surface this target presents to, or null for offscreen texture storage.
  context: GPUCanvasContext | null;
  depthStencilTexture: GPUTexture;
  depthStencilView: GPUTextureView;
  // The color attachment's GPU format. A Wgpu pipeline bakes its color attachment format, so scene
  // pipelines key their compiled variant on this. Defaults to the canvas format; an HDR effect target
  // uses 'rgba16float'.
  format: GPUTextureFormat;
  height: number;
  // Effective coverage sample count. WGPU realizes four samples by rendering a 2x extent in each axis;
  // a texture target remains sampleable so the existing presentation pass performs the resolve.
  sampleCount: number;
  width: number;
}

// A free-list of reusable texture targets. The effect pipeline owns one and lends intermediate targets
// to multi-pass recipes via acquireWgpuRenderTarget / releaseWgpuRenderTarget. Screen targets are never
// pooled — there is one per surface and it lives as long as its context.
export type WgpuRenderTargetPool = Entity & {
  free: WgpuTextureRenderTarget[];
};

// The default swap-chain surface as a render target. It has no sampleable texture: WebGPU hands out a
// fresh swap-chain texture each frame, so nothing may hold a view across frames, and no effect input,
// present, or draw-result path can read one. That is why this is a distinct type from
// WgpuTextureRenderTarget rather than a flag on it — sampling is a compile-time constraint.
//
// Width/height track `surface`, which for the web path is the canvas element itself.
export interface WgpuScreenRenderTarget extends WgpuRenderTarget {
  // 2x supersample in each axis, resolved into the swap-chain texture by one fullscreen linear-sampling
  // pass immediately before submit. Deliberately a surface seam rather than a pipeline variant: every
  // scene pipeline stays single-sampled.
  antialias: boolean;
  antialiasResolveBindGroup: GPUBindGroup | null;
  antialiasTexture: GPUTexture | null;
  antialiasView: GPUTextureView | null;
  // Opt-in frame capture (enableWgpuFrameCapture -> createBitmapFromWgpuScreenRenderTarget). When
  // enabled the frame renders into `captureTexture` (an offscreen COPY_SRC target) instead of the
  // swap chain, because software/headless adapters do not present the swap chain and its texture
  // reads back as zeros. The frame's own encoder copies that texture into `captureBuffer`; the CPU
  // maps only the buffer afterward.
  captureBuffer: GPUBuffer | null;
  captureBytesPerRow: number;
  captureEnabled: boolean;
  captureHeight: number;
  captureTexture: GPUTexture | null;
  captureWidth: number;
  readonly context: GPUCanvasContext;
  readonly device: GPUDevice;
  // The view a frame ultimately presents into — the swap-chain view, or `captureTexture`'s view while
  // capture is on. Live only between the begin and the submit of one frame; null outside a frame.
  presentationView: GPUTextureView | null;
  // The presentation surface's live size. Not an HTMLCanvasElement: nothing on this path reads a DOM
  // member, so a native host supplies its own size provider and the web path passes its canvas directly.
  readonly surface: WgpuPresentationSurface;
}

// Anything that can hand out a WebGPU canvas context and report its own size: an HTMLCanvasElement, an
// OffscreenCanvas, or a native host's surface object. Typed structurally so render-wgpu names no DOM
// type and a native host needs no web shim.
export interface WgpuScreenSurface extends WgpuPresentationSurface {
  getContext(contextId: 'webgpu'): GPUCanvasContext | null;
}

export interface WgpuScreenRenderTargetOptions {
  // Supersample the surface at 2x in each axis, then resolve into the swap chain. Default false.
  readonly antialias?: boolean;
  // Alpha compositing of the swap-chain texture against the page. Default 'premultiplied'.
  readonly alphaMode?: GPUCanvasAlphaMode;
  readonly colorSpace?: RenderTargetColorSpace;
  // Swap-chain texture format. Default 'bgra8unorm'; pass the adapter's preferred canvas format when
  // the caller has one.
  readonly format?: GPUTextureFormat;
}

// Offscreen, sampleable render storage: the target an effect pass, a render cache, or a shadow map
// draws into and a later draw reads as a texture.
export interface WgpuTextureRenderTarget extends WgpuRenderTarget {
  // Per-sampler bind groups over `view`, same contract as WgpuTextureEntry: which sampler a draw uses is
  // a draw policy re-read per draw, never captured into the target when it is allocated or resized.
  bindings: WgpuTextureBindings;
  readonly context: null;
  // Render targets are always allocated single-level; declared so a target satisfies WgpuTextureResource.
  mipLevelCount: number;
  texture: GPUTexture;
  view: GPUTextureView;
}
