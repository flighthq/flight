// Substrate-agnostic render-target description. A target carries axes, not booleans: `format`/
// `colorFormats` unlock HDR and the G-buffer, `colorAttachments` is MRT/deferred, `sampleCount` is
// MSAA, `depth` carries target-scope stencil and (for '-sampled') a readable depth texture. The
// per-backend target types (GlRenderTarget, WgpuRenderTarget) realize these axes.

export type RenderTargetFormat = 'rgba8' | 'rgba16f' | 'rgba32f';

export type RenderTargetDepth = 'none' | 'depth-stencil' | 'depth-stencil-sampled';

export interface RenderTargetDescriptor {
  width: number;
  height: number;
  // Color attachment 0 format. Default 'rgba8'. 'rgba16f'/'rgba32f' give HDR headroom for bloom and
  // are the float formats a future G-buffer uses.
  format?: RenderTargetFormat;
  // Number of color attachments (MRT). Default 1. >1 is the deferred-shading / G-buffer path.
  colorAttachments?: number;
  // Per-attachment format override when colorAttachments > 1; index 0 falls back to `format`.
  colorFormats?: ReadonlyArray<RenderTargetFormat>;
  // MSAA sample count. Default 1 (no MSAA). 2 | 4 | 8 — clamped to the device max.
  sampleCount?: number;
  // Depth/stencil attachment. Default 'none'. 'depth-stencil-sampled' additionally exposes the depth
  // as a sampleable texture for depth-dependent effects (SSAO, depth-of-field, fog).
  depth?: RenderTargetDepth;
}
