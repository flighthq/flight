import type { GraphBoundsNode, HasBoundsRect, HasBoundsRectRuntime, MethodsOf, Rectangle } from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
export function defaultComputeLocalBoundsRectangle(_out: Rectangle, _source: Readonly<GraphBoundsNode<any, any>>) {}

export function initBoundsRectRuntimeTrait(
  target: HasBoundsRectRuntime,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectRuntime>>>,
): void {
  target.boundsRect = null;
  target.localBoundsRect = null;
  target.worldBoundsRect = null;
  target.computeLocalBoundsRect = methods?.computeLocalBoundsRect ?? defaultComputeLocalBoundsRectangle;
}

export function initBoundsRectTrait(_target: HasBoundsRect, _obj?: Readonly<Partial<HasBoundsRect>>): void {}
