import type { DisplayObjectContainer } from '@flighthq/types';

import { create as createDisplayObjectContainer } from './displayObjectContainer.js';

export function create(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  return createDisplayObjectContainer(obj);
}
