import type { DisplayObject } from '@flighthq/types';
import { GraphState } from '@flighthq/types';

export function getGraphState(source: DisplayObject): GraphState {
  if (source[GraphState.SymbolKey] === undefined) {
    source[GraphState.SymbolKey] = {
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
      worldTransformUsingLocalTransformID: -1,
      worldTransformUsingParentTransformID: -1,
    };
  }
  return source[GraphState.SymbolKey];
}
