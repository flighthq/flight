import type { RenderEffect } from './RenderEffect';

export interface GodRaysEffect extends RenderEffect {
  kind: 'GodRaysEffect'; // [HDR]
  centerX?: number;
  centerY?: number;
  density?: number;
  decay?: number;
  weight?: number;
  exposure?: number;
  samples?: number;
}
