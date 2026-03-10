import type { GraphNode, HasBoundsRect, HasBoundsRectRuntime, Rectangle } from '@flighthq/types';

import { getRuntime } from './node';

export function defaultComputeLocalBoundsRect<G extends symbol>(
  _out: Rectangle,
  _source: Readonly<GraphNode<G> & HasBoundsRect<G>>,
) {}

export function getHasBoundsRectRuntime<G extends symbol>(
  source: GraphNode<G> & HasBoundsRect<G>,
): HasBoundsRectRuntime<G> {
  return getRuntime(source) as HasBoundsRectRuntime<G>;
}

export function initHasBoundsRect<G extends symbol>(
  _target: HasBoundsRect<G>,
  _obj?: Readonly<Partial<HasBoundsRect<G>>>,
): void {}

export function initHasBoundsRectRuntime<G extends symbol>(
  target: HasBoundsRectRuntime<G>,
  methods?: Readonly<Partial<HasBoundsRectRuntime<G>>>,
): void {
  target.boundsRect = null;
  target.localBoundsRect = null;
  target.worldBoundsRect = null;
  target.computeLocalBoundsRect = methods?.computeLocalBoundsRect ?? defaultComputeLocalBoundsRect;
}
