import type { DisplayObjectContainer } from '@flighthq/types';

import { createDisplayObjectContainer } from './createDisplayObjectContainer';

export function createSprite(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  return createDisplayObjectContainer(obj);
}
