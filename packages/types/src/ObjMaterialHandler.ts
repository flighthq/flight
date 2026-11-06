// Owned by `@flighthq/scene3d-formats`. These deprecated re-exports keep existing `@flighthq/types`
// imports compiling until consumers import the owning package.

/** @deprecated Import from `@flighthq/scene3d-formats/contract`. */
export type { ObjMaterialHandler, ObjImportOptions } from '@flighthq/scene3d-formats/contract';

// Deprecated structural copies of scene3d-formats' literal constants (core may cross into an owner only
// with type-only edges); the values are identical literals.
/** The feature name for MTL's classic Ka/Kd/Ks/Ns shading model. */
export const OBJ_MATERIAL_BLINN_PHONG_FEATURE = 'MaterialBlinnPhong';

/** The feature name for MTL's metallic-roughness PBR extensions (Pr/Pm and the sheen/clearcoat family). */
export const OBJ_MATERIAL_STANDARD_PBR_FEATURE = 'MaterialStandardPbr';
