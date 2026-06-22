import type { Entity, EntityWithoutRuntime } from './Entity';

// Serializable per-node rendering intent. Plain data only — named fields, no GPU
// handles and no function references — so a material round-trips through scene
// serialization. Behavior is supplied by a per-backend material renderer registered
// against `kind` on the render state (see GlMaterialRenderer, CanvasMaterialRenderer).
//
// A material `kind` is a shared registry key, not a backend-specific resource. Not every
// backend registers a renderer for every kind: a Gl-only material has no Canvas
// renderer and degrades to DefaultMaterialKind there rather than erroring.
//
// Batching keys on the material by reference — sharing one material instance across nodes
// batches them; a different material always breaks the batch (different program, different
// uniforms, or a different instance layout). No version field: mutating a shared material
// in place updates every node that uses it, and the existing appearance invalidation drives
// re-resolution.
export interface Material extends Entity {
  readonly kind: symbol;
}

export type MaterialLike = EntityWithoutRuntime<Material>;

// Per-node, material-specific data (the companion to HasMaterial.material). Plain serializable
// data a material consumes per node — e.g. a per-instance color transform for ColorTransformMaterial.
// Its concrete shape is defined by the material kind that reads it.
export type MaterialData = object;

// Resolved when a node carries no material, or its material kind has no renderer on the
// render state. The built-in default renderer draws the node with the standard pipeline.
export const DefaultMaterialKind: unique symbol = Symbol('DefaultMaterial');
