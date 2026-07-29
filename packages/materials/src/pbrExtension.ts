import type { PbrUvSet } from '@flighthq/types/contract';

// True when a texture input selects one of the UV channels in the canonical mesh layout.
export function isValidPbrUvSet(value: number): value is PbrUvSet {
  return value === 0 || value === 1;
}
