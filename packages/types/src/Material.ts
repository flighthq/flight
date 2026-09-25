import type { Entity, EntityWithoutRuntime, Kind } from './Entity.ts';

// Serializable per-node rendering intent. Plain data only — named fields, no GPU
// handles and no function references — so a material round-trips through scene
// serialization. Behavior is supplied by a per-backend material renderer registered
// against `kind` on the render state (see GlQuadMaterialRenderer, CanvasQuadMaterialRenderer).
//
// A material `kind` is a shared registry key, not a backend-specific resource. Not every
// backend registers a renderer for every kind: a Gl-only material has no Canvas
// renderer and degrades to StandardMaterialKind there rather than erroring.
//
// Batching keys on the material by reference — sharing one material instance across nodes
// batches them; a different material always breaks the batch (different program, different
// uniforms, or a different instance layout). No version field: mutating a shared material
// in place updates every node that uses it, and the existing appearance invalidation drives
// re-resolution.
// The phantom key that separates Material2D from Material3D. Both branches declare it optional with
// a different string-literal type, and that CONFLICT is what makes the two nominally distinct: without
// it Material2D — which adds no fields — is structurally satisfied by any Material3D, so a
// PhongMaterial would assign straight into a 2D slot.
//
// Ambient and optional on purpose. `declare` means it never exists at runtime and every reference is
// `import type`, so this adds no discriminant field, no data, and nothing to serialize — a material
// round-trips exactly as before. Optional so no constructor writes it and a bare `Material` (which
// declares it nowhere) still widens into either branch, keeping the base the wide type.
//
// Separate per-branch keys would NOT work: an absent optional property is still assignable, so only a
// shared key with incompatible types rejects. Mirrors the phantom-key idiom already used by
// SelectionState, GizmoState and the controller types.
export declare const MaterialDimensionKey: unique symbol;

export interface Material extends Entity {
  readonly kind: Kind;
  // The authored material name — an importer preserves the source file's material identity here
  // (an MTL `newmtl`, a glTF `material.name`, a 3DS material chunk), so a material stays
  // addressable by its artist-given handle after import (see findScene3DMaterialByName). `null` for
  // programmatically-created materials that carry no authored name (createMaterial defaults it so).
  // Optional so `MaterialLike` structural literals need not spell it; entity constructors normalize
  // it to `null`. Inert data, part of the serialized round-trip.
  name?: string | null;
}

export type MaterialLike = EntityWithoutRuntime<Material>;

// Per-node, material-specific data (the companion to HasMaterial.material). Plain serializable
// data a material consumes per node. Its concrete shape is defined by the material kind that reads
// it.
export interface MaterialData extends Entity {}
