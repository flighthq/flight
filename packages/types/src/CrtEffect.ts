import type { RenderEffect } from './RenderEffect';

export interface CrtEffect extends RenderEffect {
  kind: 'CrtEffect';
  curvature?: number;
  scanlineIntensity?: number;
  vignette?: number;
  aberration?: number;
}
