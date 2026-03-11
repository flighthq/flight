import type { GraphNode, HasBoundsRect, HasBoundsRectRuntime, MethodsOf, Rectangle } from '@flighthq/types';

export function defaultComputeLocalBoundsRect<G extends symbol>(
  _out: Rectangle,
  _source: Readonly<GraphNode<G> & HasBoundsRect<G>>,
) {}

export function initHasBoundsRect<G extends symbol>(
  _target: HasBoundsRect<G>,
  _obj?: Readonly<Partial<HasBoundsRect<G>>>,
): void {}

export function initHasBoundsRectRuntime<G extends symbol>(
  target: HasBoundsRectRuntime<G>,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectRuntime<G>>>>,
): void {
  target.boundsRect = null;
  target.localBoundsRect = null;
  target.worldBoundsRect = null;
  target.computeLocalBoundsRect = methods?.computeLocalBoundsRect ?? defaultComputeLocalBoundsRect;
}
