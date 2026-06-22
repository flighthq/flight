import type { RenderEffect } from './RenderEffect';

export interface WhiteBalanceEffect extends RenderEffect {
  kind: 'WhiteBalanceEffect';
  temperature?: number; // -1..1 warm/cool.
  tint?: number; // -1..1 magenta/green.
}
