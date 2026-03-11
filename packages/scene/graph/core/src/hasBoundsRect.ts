import type { HasBoundsRect, HasBoundsRectRuntime, MethodsOf, Node, Rectangle } from '@flighthq/types';

export function defaultComputeLocalBoundsRect(_out: Rectangle, _source: Readonly<Node>) {}

export function initHasBoundsRect(_target: HasBoundsRect, _obj?: Readonly<Partial<HasBoundsRect>>): void {}

export function initHasBoundsRectRuntime(
  target: HasBoundsRectRuntime,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectRuntime>>>,
): void {
  target.boundsRect = null;
  target.localBoundsRect = null;
  target.worldBoundsRect = null;
  target.computeLocalBoundsRect = methods?.computeLocalBoundsRect ?? defaultComputeLocalBoundsRect;
}
