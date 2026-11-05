import type { BlendMode } from './BlendMode.ts';
import type { MaterialAlphaMode } from './Material3D.ts';

// The optional-everywhere options block for the shared Material3D trailer. Every concrete 3D
// material options type extends this (BlinnPhong/PBR via `Partial<…Material>`, ShadedMaterial
// via `ShadedMaterialOptions`), so `alphaMode`/`alphaCutoff`/`blendMode`/`doubleSided` are
// settable uniformly at construction across ALL 3D materials — the trailer is a base concern, not
// a per-constructor one. `createMaterial3D` applies these in one place; each `create*Material`
// forwards its options through. An omitted field falls back to the trailer default (opaque,
// single-sided, Normal blend, 0.5 mask cutoff).
export interface Material3DOptions {
  alphaCutoff?: number;
  alphaMode?: MaterialAlphaMode;
  blendMode?: BlendMode;
  doubleSided?: boolean;
}
