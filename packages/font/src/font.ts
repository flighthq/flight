import { createEntity } from '@flighthq/entity';
import type { Font } from '@flighthq/types';

export function createFont(name: string): Font {
  return createEntity({ name });
}
