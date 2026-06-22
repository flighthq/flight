import type { SketchEffect } from '@flighthq/types';

export function createSketchEffect(options: Readonly<Omit<SketchEffect, 'kind'>> = {}): SketchEffect {
  return { kind: 'SketchEffect', ...options };
}
