import type { BlendMode } from './BlendMode';
import type { MaterialAlphaMode } from './SurfaceMaterial';

// The optional-everywhere options block for the shared SurfaceMaterial trailer. Every concrete
// surface-material options type extends this (BlinnPhong/PBR via `Partial<…Material>`, ShadedMaterial
// via `ShadedMaterialOptions`), so `alphaMode`/`alphaCutoff`/`blendMode`/`doubleSided` are
// settable uniformly at construction across ALL surface materials — the trailer is a base concern, not
// a per-constructor one. `createSurfaceMaterial` applies these in one place; each `create*Material`
// forwards its options through. An omitted field falls back to the trailer default (opaque,
// single-sided, straight alpha, Normal blend, 0.5 mask cutoff).
export interface SurfaceMaterialOptions {
  alphaCutoff?: number;
  alphaMode?: MaterialAlphaMode;
  blendMode?: BlendMode;
  doubleSided?: boolean;
}
