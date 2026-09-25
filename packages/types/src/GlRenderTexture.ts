import type { Entity } from './Entity.ts';
import type { GlContext } from './GlContext.ts';
import type { GlRenderState } from './GlRenderState.ts';
import type { GlTextureRenderTarget, GlTextureRenderTargetPool } from './GlRenderTarget.ts';
import type { RenderTexture } from './RenderTexture.ts';

export type GlRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface GlRenderTextureExplanation {
  readonly height: number;
  readonly status: GlRenderTextureStatus;
  readonly width: number;
}

export interface GlRenderTextureEntry {
  status: GlRenderTextureStatus;
  target: GlTextureRenderTarget;
}

// App-level lease pool. Its currency is RenderTexture; the raw target pool is an implementation
// detail used by multi-pass effect runners.
export interface GlRenderTexturePool extends Entity {
  context: GlContext | null;
  destroyed: boolean;
  readonly effectTargets: GlTextureRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
}

export type GlRenderTextureGuard = (
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<GlRenderTextureExplanation>,
) => void;
