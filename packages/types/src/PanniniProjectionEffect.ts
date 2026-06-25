import type { RenderEffect } from './RenderEffect';
export interface PanniniProjectionEffect extends RenderEffect {
  kind: 'PanniniProjectionEffect';
  compression?: number;
  crop?: number;
}
