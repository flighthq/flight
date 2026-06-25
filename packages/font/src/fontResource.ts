import type { FontResource } from '@flighthq/types';

export function createFontResource(family: string): FontResource {
  return { family, face: null };
}
