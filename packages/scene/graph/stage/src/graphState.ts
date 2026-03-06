import type { DisplayObject, GraphState, Rectangle } from '@flighthq/types';
import { GraphStateKey } from '@flighthq/types';

export function createGraphState(computeLocalBounds?: (out: Rectangle, source: DisplayObject) => void): GraphState {
  return {
    appearanceID: 0,
    boundsRectUsingLocalBoundsID: -1,
    boundsRectUsingLocalTransformID: -1,
    boundsRect: null,
    computeLocalBounds: computeLocalBounds ?? defaultComputeLocalBounds,
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

export function getGraphState<T extends DisplayObject>(source: T): GraphState {
  return source[GraphStateKey]!;
}

function defaultComputeLocalBounds(_out: Rectangle, _source: DisplayObject): void {}
