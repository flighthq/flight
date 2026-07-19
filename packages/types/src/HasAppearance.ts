import type { EntityRuntime } from './Entity';
import type { Node, NodeTraits } from './Node';

// Per-object hierarchical render state, shared across 2D and 3D graphs. `alpha` (opacity, default 1)
// and `visible` (default true) both compose down the hierarchy — a group's alpha multiplies, and its
// visibility gates, its children — into resolved values the renderer honors. Blend is deliberately not
// here: 2D per-instance compositing is `HasBlendMode`; 3D transparency is a material property.
export interface HasAppearance {
  alpha: number;
  visible: boolean;
}

// Runtime cache for `HasAppearance`'s resolved parent×self opacity, used where appearance resolves on
// the node (the 3D scene graph — see ensureSceneNodeWorldAlpha). Mirrors the transform world matrix:
// lazily ensured, revision-gated (self appearance revision + parent's `worldAppearanceId`), with
// `worldAppearanceId` propagating a change downward like `worldTransformId`. (2D resolves appearance on
// the render proxy instead, so 2D display-object runtimes do not carry this tier.)
export interface HasAppearanceRuntime extends EntityRuntime {
  worldAlpha: number | null;
  worldAlphaUsingAppearanceId: number;
  worldAlphaUsingParentAppearanceId: number;
  worldAppearanceId: number;
}

export type AppearanceNode<Traits extends object = NodeTraits> = Node<Traits> & HasAppearance;
