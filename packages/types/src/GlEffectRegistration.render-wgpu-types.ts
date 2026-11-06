import type { Effect } from '@flighthq/effects/contract';

import type { GlRenderState } from './GlRenderState.ts';
import type { GlTextureRenderTarget, GlTextureRenderTargetPool } from './GlRenderTarget.ts';

// What a GL effect runner is handed: the state, the input it reads, the output it writes, the pool
// it borrows intermediate targets from, and the scene G-buffer attachments.
export interface GlEffectContext {
  readonly state: GlRenderState;
  readonly source: Readonly<GlTextureRenderTarget>;
  readonly dest: Readonly<GlTextureRenderTarget>;
  readonly pool: GlTextureRenderTargetPool;
  readonly sceneDepthTexture: WebGLTexture | null;
  readonly sceneVelocityTexture: WebGLTexture | null;
}

export type GlEffectRunner = (ctx: Readonly<GlEffectContext>, effect: Readonly<Effect>) => void;

export type GlEffectResolver = (state: GlRenderState, effect: Readonly<Effect>) => boolean;

export interface GlEffectRegistration {
  readonly isResolvable?: GlEffectResolver;
  readonly runner: GlEffectRunner;
}
