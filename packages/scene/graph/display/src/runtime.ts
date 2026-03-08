import { createBoundsAndTransform2DRuntime } from '@flighthq/scene-graph-core';
import type { DisplayObjectKind, DisplayObjectRuntime } from '@flighthq/types';

export function createDisplayObjectRuntime<K extends typeof DisplayObjectKind>(
  _nodeKind: K,
  methods?: Partial<DisplayObjectRuntime>,
): DisplayObjectRuntime {
  const out = createBoundsAndTransform2DRuntime(_nodeKind, methods) as DisplayObjectRuntime;
  return out;
}
