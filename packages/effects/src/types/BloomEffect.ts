import type { Effect } from './Effect.ts';

export interface BloomEffect extends Effect {
  kind: 'BloomEffect'; // [HDR]
  threshold?: number; // bright-pass cutoff in linear light. Default 0.8.
  intensity?: number; // additive strength. Default 1.
  radius?: number; // blur radius of the bloom branch. Default 8.
  passes?: number; // blur quality passes. Default 1.
}
