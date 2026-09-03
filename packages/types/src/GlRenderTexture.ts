import type { Entity } from './Entity';
import type { GlContext } from './GlContext';
import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget, GlRenderTargetPool } from './GlRenderTarget';
import type { RenderTexture } from './RenderTexture';

export type GlRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface GlRenderTextureExplanation {
  readonly height: number;
  readonly status: GlRenderTextureStatus;
  readonly width: number;
}

export interface GlRenderTextureEntry {
  status: GlRenderTextureStatus;
  target: GlRenderTarget;
}

// App-level lease pool. Its currency is RenderTexture; the raw target pool is an implementation
// detail used by multi-pass effect runners.
export interface GlRenderTexturePool extends Entity {
  context: GlContext | null;
  destroyed: boolean;
  readonly effectTargets: GlRenderTargetPool;
  readonly free: RenderTexture[];
  readonly leased: Set<RenderTexture>;
}

export type GlRenderTextureGuard = (
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<GlRenderTextureExplanation>,
) => void;
