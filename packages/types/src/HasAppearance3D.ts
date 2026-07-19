import type { EntityRuntime } from './Entity';
import type { Node, NodeTraits } from './Node';

// Per-object appearance for the 3D scene graph. `alpha` is the node's own opacity in [0, 1]
// (1 = fully opaque, the default). It composes down the hierarchy — a group's alpha multiplies its
// children's — into a resolved per-object alpha the renderer honors (see HasAppearance3DRuntime),
// the 3D analog of the 2D HasAppearance alpha. Deliberately narrower than the 2D trait: 3D blending
// is a material property (SurfaceMaterial.blendMode), not a per-node one, so only opacity lives here.
export interface HasAppearance3D {
  alpha: number;
}

// Render state paired with HasAppearance3D. `worldAlpha` is the resolved parent×self opacity, lazily
// ensured on access (getSceneNodeWorldAlpha) and cached — the 3D analog of the resolved 2D RenderProxy
// alpha, mirroring the transform's ensure-on-access world matrix. `null` until first resolved. The
// `*UsingAppearanceId` fields gate the cache (self appearance revision + parent's `worldAppearanceId`),
// and `worldAppearanceId` propagates a change down the hierarchy exactly like `worldTransformId`.
// Runtime tier: render state, not authoring data.
export interface HasAppearance3DRuntime extends EntityRuntime {
  worldAlpha: number | null;
  worldAlphaUsingAppearanceId: number;
  worldAlphaUsingParentAppearanceId: number;
  worldAppearanceId: number;
}

export type Appearance3DNode<Traits extends object = NodeTraits> = Node<Traits> & HasAppearance3D;
