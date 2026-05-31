import type { GraphBoundsNode, HasBoundsRect, HasBoundsRectRuntime, MethodsOf, Rectangle } from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
export function defaultComputeLocalBoundsRectangle(_out: Rectangle, _source: Readonly<GraphBoundsNode<any, any>>) {}

export function initHasBoundsRectangle(_target: HasBoundsRect, _obj?: Readonly<Partial<HasBoundsRect>>): void {}

export function initHasBoundsRectangleRuntime(
  target: HasBoundsRectRuntime,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectRuntime>>>,
): void {
  target.boundsRect = null;
  target.localBoundsRect = null;
  target.worldBoundsRect = null;
  target.computeLocalBoundsRect = methods?.computeLocalBoundsRect ?? defaultComputeLocalBoundsRectangle;
}
