import type {
  BoundsNodeAny,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  Rectangle,
} from '@flighthq/types/contract';

export function defaultComputeLocalBoundsRectangle(_out: Rectangle, _source: Readonly<BoundsNodeAny>) {}

export function initBoundsRectangleRuntimeTrait(
  target: HasBoundsRectangleRuntime,
  methods?: Readonly<
    Partial<MethodsOf<HasBoundsRectangleRuntime> & Pick<HasBoundsRectangleRuntime, 'isLocalBoundsRectangleValid'>>
  >,
): void {
  target.boundsRectangle = null;
  target.localBoundsRectangle = null;
  target.worldBoundsRectangle = null;
  target.computeLocalBoundsRectangle = methods?.computeLocalBoundsRectangle ?? defaultComputeLocalBoundsRectangle;
  target.isLocalBoundsRectangleValid = methods?.isLocalBoundsRectangleValid ?? null;
}

export function initBoundsRectangleTrait(
  _target: HasBoundsRectangle,
  _obj?: Readonly<Partial<HasBoundsRectangle>>,
): void {}
