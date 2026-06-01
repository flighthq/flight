import type { FontSource } from '@flighthq/types';

export function createFontSource(family: string): FontSource {
  return { family, face: null };
}
