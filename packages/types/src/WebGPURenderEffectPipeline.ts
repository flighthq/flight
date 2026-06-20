import type { RenderEffect } from './RenderEffect';
import type { RenderEffectPipelineOptions } from './WebGLRenderEffectPipeline';
import type { WebGPURenderState } from './WebGPURenderState';
import type { WebGPURenderTarget, WebGPURenderTargetPool } from './WebGPURenderTarget';

// What a WebGPU effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene's depth and per-pixel velocity attachments, or null when the scene did not produce
// them — a depth/velocity-dependent recipe reads them when present and falls back to a color-only
// path when null. The WebGPU mirror of WebGLRenderEffectContext.
export interface WebGPURenderEffectContext {
  readonly state: WebGPURenderState;
  readonly source: Readonly<WebGPURenderTarget>;
  readonly dest: Readonly<WebGPURenderTarget>;
  readonly pool: WebGPURenderTargetPool;
  readonly sceneDepthTexture: GPUTexture | null;
  readonly sceneVelocityTexture: GPUTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. defaultWebGPUBloomEffectRunner); register an alternative under the same key to swap algorithms.
export type WebGPURenderEffectRunner = (
  ctx: Readonly<WebGPURenderEffectContext>,
  effect: Readonly<RenderEffect>,
) => void;

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endWebGPURenderEffectPipeline, not retained here. Mirrors WebGLRenderEffectPipeline; shares
// RenderEffectPipelineOptions with the WebGL pipeline.
export interface WebGPURenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: WebGPURenderTarget | null;
  readonly pool: WebGPURenderTargetPool;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA); null when no velocity pass ran (velocity-driven effects then color-only-fall-back).
  // Depth, by contrast, comes from the scene target directly.
  velocityTexture: GPUTexture | null;
}
