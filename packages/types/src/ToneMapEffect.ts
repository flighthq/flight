import type { RenderEffect } from './RenderEffect';

export type ToneMapOperator = 'reinhard' | 'aces' | 'filmic' | 'agx' | 'uncharted2';

export interface ToneMapEffect extends RenderEffect {
  kind: 'ToneMapEffect'; // [HDR]
  operator?: ToneMapOperator;
  exposure?: number;
  white?: number; // white point (Reinhard extended / filmic).
}
