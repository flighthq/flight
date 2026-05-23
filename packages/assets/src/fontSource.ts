import { createEntity } from '@flighthq/foundation';
import type { FontSource } from '@flighthq/types';

export function createFontSource(name: string): FontSource {
  return createEntity({ name });
}
