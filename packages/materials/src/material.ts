import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { Kind, Material, EntityConstruction } from '@flighthq/types/contract';

// Structural shallow clone of any material entity. Scalar fields and kind are copied by
// value; Texture/map handle references are shared (they are not owned by the material).
export function cloneMaterial(source: Readonly<Material>): Material {
  const clone = allocateEntity<Material>();
  clone.kind = source.kind;
  copyMaterialFields(clone, source, source.kind);
  return finishEntity(clone);
}

// Structural copy for pooling and reuse. Writes all own enumerable fields from `source`
// onto `out`. Map handles are shared by reference. Alias-safe: each field is independent.
export function copyMaterial(out: Material, source: Readonly<Material>): void {
  if (out === source) return;
  copyMaterialFields(out, source, source.kind);
}

export function createMaterial(kind: Kind): Material {
  const material = allocateEntity<Material>();
  initializeMaterial(material, kind);
  return finishEntity(material);
}

// Structural equality for dedup, pooling, and serialization round-trips — NOT the batch
// flush path (batching keys on material by reference). Compares own enumerable data fields
// by value for scalars and kind strings, and by reference for Texture/map handles.
export function equalsMaterial(a: Readonly<Material>, b: Readonly<Material>): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  const aFields = a as unknown as Record<string, unknown>;
  const bFields = b as unknown as Record<string, unknown>;
  const aKeys = Object.keys(aFields);
  const bKeys = Object.keys(bFields);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.hasOwn(bFields, key)) return false;
    if (key === 'kind') continue;
    if (aFields[key] !== bFields[key]) return false;
  }
  return true;
}

// Returns `material` narrowed to the specific material type `T` when its `kind` matches, else
// `null` (including for a `null` input). The sanctioned narrowing for the open material-kind model:
// `getMaterialOfKind(mesh.materials[0], BlinnPhongMaterialKind)` yields a `BlinnPhongMaterial | null`
// to read or re-derive from, without an unchecked `as` at the call site. `kind` is a registry key, so
// a vendor-prefixed custom kind narrows the same way.
export function getMaterialOfKind<T extends Material>(material: Readonly<Material> | null, kind: T['kind']): T | null {
  return material !== null && material.kind === kind ? (material as T) : null;
}

export function initializeMaterial(material: EntityConstruction<Material>, kind: Kind): void {
  material.kind = kind;
  material.name = null;
}

// Internal helper — writes all own enumerable data fields from `src` onto `dst`. Skips
// the `kind` field (already set on `dst` at construction). Handles the `standard` sub-block
// by shallow-field copy; all other values are assigned.
function copyMaterialFields(dst: Material, src: Readonly<Material>, kind: Kind): void {
  const dstFields = dst as unknown as Record<string, unknown>;
  const srcFields = src as unknown as Record<string, unknown>;
  for (const key of Object.keys(srcFields)) {
    if (key === 'kind') continue;
    const value = srcFields[key];
    if (key === 'standard' && value != null && typeof value === 'object') {
      // Shallow-copy the StandardPbrMaterialProperties block into an existing or new object.
      dstFields[key] = { ...(value as object) };
    } else {
      dstFields[key] = value;
    }
  }
  // Ensure `kind` is always the source kind (the caller may have already set it, but verify).
  dstFields['kind'] = kind;
}
