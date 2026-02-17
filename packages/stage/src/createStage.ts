import type { Stage } from '@flighthq/types';

import { createDisplayObject } from './createDisplayObject';

export function createStage(obj: Partial<Stage> = {}): Stage {
  return createDisplayObject(obj);
}
