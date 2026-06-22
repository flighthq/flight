import type { RenderEffectPipelineOptions } from './GlRenderEffectPipeline';
import type { RenderEffect } from './RenderEffect';
import type { WgpuRenderState } from './WgpuRenderState';
import type { WgpuRenderTarget, WgpuRenderTargetPool } from './WgpuRenderTarget';

// What a Wgpu effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene's depth and per-pixel velocity attachments, or null when the scene did not produce
// them — a depth/velocity-dependent recipe reads them when present and falls back to a color-only
// path when null. The Wgpu mirror of GlRenderEffectContext.
export interface WgpuRenderEffectContext {
  readonly state: WgpuRenderState;
  readonly source: Readonly<WgpuRenderTarget>;
  readonly dest: Readonly<WgpuRenderTarget>;
  readonly pool: WgpuRenderTargetPool;
  readonly sceneDepthTexture: GPUTexture | null;
  readonly sceneVelocityTexture: GPUTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. defaultWgpuBloomEffectRunner); register an alternative under the same key to swap algorithms.
export type WgpuRenderEffectRunner = (ctx: Readonly<WgpuRenderEffectContext>, effect: Readonly<RenderEffect>) => void;

// Retains the GPU resources an effect pass needs across frames: the scene target the pipeline renders
// into and the intermediate-target pool. The per-frame effect list is data passed to
// endWgpuRenderEffectPipeline, not retained here. Mirrors GlRenderEffectPipeline; shares
// RenderEffectPipelineOptions with the Gl pipeline.
export interface WgpuRenderEffectPipeline {
  readonly options: Readonly<RenderEffectPipelineOptions>;
  sceneTarget: WgpuRenderTarget | null;
  readonly pool: WgpuRenderTargetPool;
  // Per-frame velocity G-buffer fed into ctx.sceneVelocityTexture for velocity-driven effects (motion
  // blur, TAA); null when no velocity pass ran (velocity-driven effects then color-only-fall-back).
  // Depth, by contrast, comes from the scene target directly.
  velocityTexture: GPUTexture | null;
}
