import { createEntity } from '@flighthq/entity/contract';
import type { SketchEffect } from '@flighthq/types/contract';

export function createSketchEffect(options: Readonly<Omit<SketchEffect, 'kind'>> = {}): SketchEffect {
  return createEntity({ kind: 'SketchEffect', ...options });
}
