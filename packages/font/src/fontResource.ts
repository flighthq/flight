import { createEntity } from '@flighthq/entity/contract';
import type { FontResource } from '@flighthq/types/contract';

export function createFontResource(family: string): FontResource {
  return createEntity({ family, face: null });
}
