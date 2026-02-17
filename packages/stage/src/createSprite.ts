import type { Sprite } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createSprite(obj: Partial<Sprite> = {}): Sprite {
  return createDisplayObject(obj);
}
