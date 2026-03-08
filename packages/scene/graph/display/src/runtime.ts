import { createTransform2DRuntime } from '@flighthq/scene-graph-core';
import type { DisplayObject, DisplayObjectKind, DisplayObjectRuntime, Rectangle } from '@flighthq/types';

export function createDisplayObjectRuntime<K extends typeof DisplayObjectKind>(
  _nodeKind: K,
  methods?: Partial<DisplayObjectRuntime>,
): DisplayObjectRuntime {
  const out = createTransform2DRuntime(_nodeKind, methods) as DisplayObjectRuntime;
  out.boundsRectUsingLocalBoundsID = -1;
  out.boundsRectUsingLocalTransformID = -1;
  out.boundsRect = null;
  out.computeLocalBounds = methods?.computeLocalBounds ?? defaultComputeLocalBounds;
  out.localBoundsRect = null;
  out.localBoundsRectUsingLocalBoundsID = -1;
  out.localBoundsID = 0;
  out.worldBoundsRect = null;
  out.worldBoundsRectUsingLocalBoundsID = -1;
  out.worldBoundsRectUsingWorldTransformID = -1;
  return out;
}

function defaultComputeLocalBounds(_out: Rectangle, _source: DisplayObject): void {}
