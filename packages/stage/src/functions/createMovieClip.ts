import type { DisplayObjectContainer } from '@flighthq/types';

import { createDisplayObjectContainer } from './createDisplayObjectContainer';

export function createMovieClip(obj: Partial<DisplayObjectContainer> = {}): DisplayObjectContainer {
  return createDisplayObjectContainer(obj);
}
