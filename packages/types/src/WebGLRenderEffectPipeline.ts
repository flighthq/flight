import type { RenderEffect } from './RenderEffect';
import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget';
import type { WebGLRenderState } from './WebGLRenderState';
import type { WebGLRenderTarget, WebGLRenderTargetPool } from './WebGLRenderTarget';

// What a WebGL effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene target's depth and per-pixel velocity attachments, or null when the scene did not
// produce them — a depth/velocity-dependent recipe reads them when present and falls back to a
// sentinel/color-only path when null. Both are 2D-capable G-buffers: depth comes from a depth-writing
// scene pass; velocity from per-node current-vs-previous transform deltas.
export interface WebGLRenderEffectContext {
  readonly state: WebGLRenderState;
  readonly source: Readonly<WebGLRenderTarget>;
  readonly dest: Readonly<WebGLRenderTarget>;
  readonly pool: WebGLRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. defaultWebGLBloomEffectRunner); register an alternative under the same key to swap algorithms.
export type WebGLRenderEffectRunner = (ctx: Readonly<WebGLRenderEffectContext>, effect: Readonly<RenderEffect>) => void;

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
// endWebGLRenderEffectPipeline, not retained here.
export interface WebGLRenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: WebGLRenderTarget | null;
  readonly pool: WebGLRenderTargetPool;
}
