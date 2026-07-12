import type { ColorLutCache } from './ColorLutCache';
import type { GlColorLutTextureCache } from './GlColorLutTextureCache';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget, GlRenderTargetPool } from './GlRenderTarget';
import type { RenderEffect } from './RenderEffect';
import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget';

// What a Gl effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene target's depth and per-pixel velocity attachments, or null when the scene did not
// produce them — a depth/velocity-dependent recipe reads them when present and falls back to a
// sentinel/color-only path when null. Both are 2D-capable G-buffers: depth comes from a depth-writing
// scene pass; velocity from per-node current-vs-previous transform deltas.
export interface GlRenderEffectContext {
  readonly state: GlRenderState;
  readonly source: Readonly<GlRenderTarget>;
  readonly dest: Readonly<GlRenderTarget>;
  readonly pool: GlRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. defaultGlBloomEffectRunner); register an alternative under the same key to swap algorithms.
export type GlRenderEffectRunner = (ctx: Readonly<GlRenderEffectContext>, effect: Readonly<RenderEffect>) => void;

export interface RenderEffectPipelineOptions {
  // MSAA on the scene target so going offscreen for effects keeps edge AA. Default 1.
  sampleCount?: number;
  // 'rgba16f' gives bloom/tone-mapping HDR headroom. Default 'rgba8'.
  format?: RenderTargetFormat;
  // Depth attachment for depth-dependent effects (SSAO, DoF, fog). Default 'none'.
  depth?: RenderTargetDepth;
}

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endGlRenderEffectPipeline, not retained here.
export interface GlRenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: GlRenderTarget | null;
  readonly pool: GlRenderTargetPool;
  // Bake and GPU-upload memos for the fused LUT-tier adjustment run, so a static grade neither re-bakes
  // its size³ cells nor re-uploads its 3D texture every frame. `lutCache` is GC-managed; `lutTexture`
  // owns a GPU texture destroyed by destroyGlRenderEffectPipeline.
  readonly lutCache: ColorLutCache;
  readonly lutTexture: GlColorLutTextureCache;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA). Produced separately by renderGlVelocity and set via setGlRenderEffectVelocityTexture;
  // null when no velocity pass ran (velocity-driven effects then sentinel-fall-back). Depth, by contrast,
  // comes from the scene target directly.
  velocityTexture: WebGLTexture | null;
}
