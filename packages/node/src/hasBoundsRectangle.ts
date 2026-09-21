import type {
  BoundsNode,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  NodeTraits,
  Rectangle,
} from '@flighthq/types/contract';

export function defaultComputeLocalBoundsRectangle<Traits extends object = NodeTraits>(
  _out: Rectangle,
  _source: Readonly<BoundsNode<Traits>>,
) {}

export function initBoundsRectangleRuntimeTrait<Traits extends object = NodeTraits>(
  target: HasBoundsRectangleRuntime<Traits>,
  methods?: Readonly<
    Partial<
      MethodsOf<HasBoundsRectangleRuntime<Traits>> &
        Pick<HasBoundsRectangleRuntime<Traits>, 'isLocalBoundsRectangleValid'>
    >
  >,
): void {
  target.boundsRectangle = null;
  target.localBoundsRectangle = null;
  target.worldBoundsRectangle = null;
  target.computeLocalBoundsRectangle = methods?.computeLocalBoundsRectangle ?? defaultComputeLocalBoundsRectangle;
  target.isLocalBoundsRectangleValid = methods?.isLocalBoundsRectangleValid ?? null;
}

// Deliberately empty: `HasBoundsRectangle` carries no entity fields today (its state lives entirely on
// the runtime tier). Kept rather than deleted as dead code so every trait has a real init to call — a
// composition site that hand-inlines a trait's setup instead of calling its init is how a trait's
// sentinels drift out of sync with the package that owns them.
export function initBoundsRectangleTrait(
  _target: HasBoundsRectangle,
  _obj?: Readonly<Partial<HasBoundsRectangle>>,
): void {}
