import { createEntity } from '@flighthq/foundation';
import type { Font } from '@flighthq/types';

export function createFont(name: string): Font {
  return createEntity({ name });
}
