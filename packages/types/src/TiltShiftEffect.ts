import type { RenderEffect } from './RenderEffect';

export interface TiltShiftEffect extends RenderEffect {
  kind: 'TiltShiftEffect';
  center?: number; // 0..1 focus band center on Y.
  width?: number; // focus band height.
  blur?: number;
}
