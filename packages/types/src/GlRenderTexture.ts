import type { GlRenderState } from './GlRenderState';
import type { GlRenderTarget } from './GlRenderTarget';
import type { Texture } from './Texture';

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
  renderTexture: Readonly<Texture>,
  explanation: Readonly<GlRenderTextureExplanation>,
) => void;
