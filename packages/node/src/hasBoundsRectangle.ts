import type {
  BoundsNode,
  HasBoundsRectangle,
  HasBoundsRectangleRuntime,
  MethodsOf,
  NodeFields,
  Rectangle,
} from '@flighthq/types/contract';

export function defaultComputeLocalBoundsRectangle<Fields extends object = NodeFields>(
  _out: Rectangle,
  _source: Readonly<BoundsNode<Fields>>,
) {}

export function initBoundsRectangleRuntimeTrait<Fields extends object = NodeFields>(
  target: HasBoundsRectangleRuntime<Fields>,
  methods?: Readonly<
    Partial<
      MethodsOf<HasBoundsRectangleRuntime<Fields>> &
        Pick<HasBoundsRectangleRuntime<Fields>, 'isLocalBoundsRectangleValid'>
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
