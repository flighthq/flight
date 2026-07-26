import { createEntity } from '@flighthq/entity/contract';
import type { Font } from '@flighthq/types/contract';

export function createFont(name: string): Font {
  return createEntity({ name });
}
