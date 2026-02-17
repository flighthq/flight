import type { DisplayObject } from '@flighthq/types';
import { DisplayObjectState } from '@flighthq/types';

export function getDisplayObjectState(source: DisplayObject): DisplayObjectState {
  if (source[DisplayObjectState.SymbolKey] === undefined) {
    source[DisplayObjectState.SymbolKey] = {
      appearanceID: 0,
      boundsRectUsingLocalBoundsID: -1,
      boundsRectUsingLocalTransformID: -1,
      boundsRect: null,
      localBoundsRect: null,
      localBoundsRectUsingLocalBoundsID: -1,
      localBoundsID: 0,
      localTransform: null,
      localTransformID: 0,
      localTransformUsingLocalTransformID: -1,
      rotationAngle: 0,
      rotationCosine: 1,
      rotationSine: 0,
      worldBoundsRect: null,
      worldBoundsRectUsingLocalBoundsID: -1,
      worldBoundsRectUsingWorldTransformID: -1,
      worldTransform: null,
      worldTransformID: 0,
      worldTransformUsingParentID: -1,
    };
  }
  return source[DisplayObjectState.SymbolKey];
}
