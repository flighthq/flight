import type { RenderEffect } from './RenderEffect';

export interface SharpenEffect extends RenderEffect {
  kind: 'SharpenEffect';
  amount?: number;
}
