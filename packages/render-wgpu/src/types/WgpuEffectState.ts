import type { Effect } from '@flighthq/effects/contract';

import type { WgpuRenderState } from './WgpuRenderState.ts';
import type { WgpuRenderTargetPool, WgpuTextureRenderTarget } from './WgpuRenderTarget.ts';
import type { WgpuTexture } from './WgpuTexture.ts';

// What a Wgpu effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments. `source` and `dest` are
// distinct targets the pipeline ping-pongs between stages. `sceneDepthTexture`/`sceneVelocityTexture`
// are the scene's depth and per-pixel velocity attachments, or null when the scene did not produce
// them — a depth/velocity-dependent recipe reads them when present and falls back to a color-only
// path when null. The Wgpu mirror of GlEffectContext.
export interface WgpuEffectContext {
  state: WgpuRenderState;
  source: Readonly<WgpuTextureRenderTarget>;
  dest: Readonly<WgpuTextureRenderTarget>;
  pool: WgpuRenderTargetPool;
  sceneDepthTexture: WgpuTexture | null;
  sceneVelocityTexture: WgpuTexture | null;
}

// The per-backend realization registered against an effect `type`. A single function over targets —
// not a multi-method per-node renderer. The built-ins are exported as `default*` named constants
// (e.g. through registerWgpuBloomEffect); register an alternative under the same key to swap algorithms.
export type WgpuEffectRunner = (ctx: Readonly<WgpuEffectContext>, effect: Readonly<Effect>) => void;

export type WgpuEffectResolver = (state: WgpuRenderState, effect: Readonly<Effect>) => boolean;

export interface WgpuEffectRegistration {
  isResolvable?: WgpuEffectResolver;
  runner: WgpuEffectRunner;
}
