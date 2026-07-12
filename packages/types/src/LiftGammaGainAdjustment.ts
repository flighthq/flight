import type { ColorLutAdjustment } from './ColorLutAdjustment';

export interface LiftGammaGainAdjustment extends ColorLutAdjustment {
  kind: 'LiftGammaGainAdjustment';
  lift?: number; // packed RGBA shadow offset, neutral 0x000000ff.
  gamma?: number; // packed RGBA midtone gamma, neutral 0x808080ff.
  gain?: number; // packed RGBA highlight gain, neutral 0xffffffff.
}
