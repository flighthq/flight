import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget } from './GlRenderTarget';
import type { RenderTexture } from './RenderTexture';

export type GlRenderTextureStatus = 'ready' | 'unrendered' | 'writing';

export interface GlRenderTextureExplanation {
  readonly height: number;
  readonly status: GlRenderTextureStatus;
  readonly width: number;
}

export interface GlRenderTextureEntry {
  status: GlRenderTextureStatus;
  target: GlRenderTarget;
}

export type GlRenderTextureGuard = (
  state: GlRenderState,
  renderTexture: Readonly<RenderTexture>,
  explanation: Readonly<GlRenderTextureExplanation>,
) => void;
