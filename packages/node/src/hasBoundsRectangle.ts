import type {
  BoundsNodeAny,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  Rectangle,
} from '@flighthq/types/contract';

export function defaultComputeLocalBoundsRectangle(out: Rectangle, _source: Readonly<BoundsNodeAny>) {
  out.x = 0;
  out.y = 0;
  out.width = 0;
  out.height = 0;
}

export function initBoundsRectangleRuntimeTrait(
  target: HasBoundsRectangleRuntime,
  methods?: Readonly<Partial<MethodsOf<HasBoundsRectangleRuntime>>>,
): void {
  target.authoredBoundsRectangle = null;
  target.boundsRectangle = null;
  target.localBoundsRectangle = null;
  target.worldBoundsRectangle = null;
  target.computeLocalBoundsRectangle = methods?.computeLocalBoundsRectangle ?? defaultComputeLocalBoundsRectangle;
}

export function initBoundsRectangleTrait(
  _target: HasBoundsRectangle,
  _obj?: Readonly<Partial<HasBoundsRectangle>>,
): void {}
