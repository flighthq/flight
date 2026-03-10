import { getRuntime } from '@flighthq/scene-graph-core';
import type { GraphNode, HasTransform2D, HasTransform2DRuntime } from '@flighthq/types';

export function getHasTransform2DRuntime<G extends symbol>(
  source: Readonly<GraphNode<G> & HasTransform2D<G>>,
): HasTransform2DRuntime<G> {
  return getRuntime(source) as HasTransform2DRuntime<G>;
}

export function initHasTransform2D<G extends symbol>(
  target: HasTransform2D<G>,
  obj?: Readonly<Partial<HasTransform2D<G>>>,
): void {
  target.rotation = obj?.rotation ?? 0;
  target.scaleX = obj?.scaleX ?? 1;
  target.scaleY = obj?.scaleY ?? 1;
  target.x = obj?.x ?? 0;
  target.y = obj?.y ?? 0;
}

export function initHasTransform2DRuntime<G extends symbol>(
  target: HasTransform2DRuntime<G>,
  _methods?: Readonly<Partial<HasTransform2DRuntime<G>>>,
): void {
  target.localTransform2D = null;
  target.rotationAngle = 0;
  target.rotationCosine = 1;
  target.rotationSine = 0;
  target.worldTransform2D = null;
}
