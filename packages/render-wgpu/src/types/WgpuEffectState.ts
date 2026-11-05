import type { Effect } from '@flighthq/types/contract';

import type { WgpuRenderState } from './WgpuRenderState.ts';
import type { WgpuRenderTargetPool, WgpuTextureRenderTarget } from './WgpuRenderTarget.ts';

// What a Wgpu effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene's depth and per-pixel velocity attachments, or null when the scene did not produce
// them — a depth/velocity-dependent recipe reads them when present and falls back to a color-only
// path when null. The Wgpu mirror of GlEffectContext.
export interface WgpuEffectContext {
  readonly state: WgpuRenderState;
  readonly source: Readonly<WgpuTextureRenderTarget>;
  readonly dest: Readonly<WgpuTextureRenderTarget>;
  readonly pool: WgpuRenderTargetPool;
  readonly sceneDepthTexture: GPUTexture | null;
  readonly sceneVelocityTexture: GPUTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. through registerWgpuBloomEffect); register an alternative under the same key to swap algorithms.
export type WgpuEffectRunner = (ctx: Readonly<WgpuEffectContext>, effect: Readonly<Effect>) => void;

export type WgpuEffectResolver = (state: WgpuRenderState, effect: Readonly<Effect>) => boolean;

export interface WgpuEffectRegistration {
  readonly isResolvable?: WgpuEffectResolver;
  readonly runner: WgpuEffectRunner;
}
