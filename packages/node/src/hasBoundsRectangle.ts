import type {
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  Rectangle,
  SceneBoundsNode,
} from '@flighthq/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- unique symbol variance prevents a tighter type here
export function defaultComputeLocalBoundsRectangle(_out: Rectangle, _source: Readonly<SceneBoundsNode<any, any>>) {}

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
