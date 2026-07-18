// Substrate-agnostic render-target description. A target carries axes, not booleans: `format`/
// `colorFormats` unlock HDR and the G-buffer, `colorAttachments` is MRT/deferred, `sampleCount` is
// MSAA, `depth` carries target-scope stencil and (for '-sampled') a readable depth texture. The
// per-backend target types (GlRenderTarget, WgpuRenderTarget) realize these axes.

export type RenderTargetFormat = 'rgba8' | 'rgba16f' | 'rgba32f';

export type RenderTargetDepth = 'none' | 'depth-stencil' | 'depth-stencil-sampled';

// Color space of the pixels a target holds — a declared property of the target, NOT inferred from
// `format` ('rgba16f' can hold either linear HDR scene radiance or already-sRGB 2D content). 'linear'
// content (scene-gl materials output linear) must be sRGB-encoded once at present; 'srgb' content (2D
// display-object colors, already encoded) is presented as-is. The present step reads this to decide
// whether to run the linear->sRGB OETF, so gamma is neither double-applied nor skipped.
export type RenderTargetColorSpace = 'linear' | 'srgb';

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
  // Color space of the content the target will hold. Default 'srgb' (existing callers + all 2D are
  // unchanged: presented as-is). Producers of linear content (the 3D scene path) declare 'linear' so
  // the present applies the single sRGB encode.
  colorSpace?: RenderTargetColorSpace;
  // Packed-RGBA (0xRRGGBBAA) clear color per color attachment, applied when a pass clears that
  // attachment. Fixed per target — a pass decides only WHETHER to clear (RenderPassPreserve), never to
  // what. Index i covers attachment location i; a single-entry array covers attachment 0. Attachments
  // with no entry fall back to the render state's background color.
  clearColors?: ReadonlyArray<number>;
  // Depth clear value applied when a pass clears depth. Default 1 (the far plane).
  clearDepth?: number;
}
