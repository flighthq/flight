import { createEntity } from '@flighthq/core';
import type { Timeline } from '@flighthq/types';

export function createTimeline(obj: Partial<Timeline> = {}): Timeline {
  return createEntity({
    frameRate: obj?.frameRate ?? null,
    scenes: obj?.scenes ?? [],
    scripts: obj?.scripts ?? [],
  });
}
