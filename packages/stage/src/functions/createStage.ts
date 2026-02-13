import type { DisplayObjectContainer } from '@flighthq/types';

import { createDisplayObjectContainer } from './createDisplayObjectContainer';

export function createStage(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  return createDisplayObjectContainer(obj);
}
