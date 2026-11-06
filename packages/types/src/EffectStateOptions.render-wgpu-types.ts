import type { RenderTargetDepth, RenderTargetFormat } from './RenderTarget.ts';

export interface EffectStateOptions {
  depth?: RenderTargetDepth;
  format?: RenderTargetFormat;
  sampleCount?: number;
}
