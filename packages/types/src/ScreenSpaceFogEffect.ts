import type { RenderEffect } from './RenderEffect';

export interface ScreenSpaceFogEffect extends RenderEffect {
  kind: 'ScreenSpaceFogEffect'; // [DEPTH]
  color?: number;
  near?: number;
  far?: number;
  density?: number;
}
