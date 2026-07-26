import type { FontResource } from '@flighthq/types/contract';

export function createFontResource(family: string): FontResource {
  return { family, face: null };
}
