import type {
  BoundsNodeAny,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  Rectangle,
} from '@flighthq/types';

export function defaultComputeLocalBoundsRectangle(_out: Rectangle, _source: Readonly<BoundsNodeAny>) {}

export function initBoundsRectangleRuntimeTrait(
  target: HasBoundsRectangleRuntime,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectangleRuntime>>>,
): void {
  target.boundsRectangle = null;
  target.localBoundsRectangle = null;
  target.worldBoundsRectangle = null;
  target.computeLocalBoundsRectangle = methods?.computeLocalBoundsRectangle ?? defaultComputeLocalBoundsRectangle;
}

export function initBoundsRectangleTrait(
  _target: HasBoundsRectangle,
  _obj?: Readonly<Partial<HasBoundsRectangle>>,
): void {}
