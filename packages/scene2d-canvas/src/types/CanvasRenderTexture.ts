import type { CanvasTextureRenderTarget } from './CanvasRenderTarget.ts';

export type CanvasRenderTextureStatus = 'ready' | 'released' | 'unrendered' | 'writing';

export interface CanvasRenderTextureExplanation {
  readonly height: number;
  readonly status: CanvasRenderTextureStatus;
  readonly width: number;
}

export interface CanvasRenderTextureEntry {
  status: CanvasRenderTextureStatus;
  target: CanvasTextureRenderTarget;
}
