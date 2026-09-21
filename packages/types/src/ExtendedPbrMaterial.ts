import type { Material3D } from './Material3D';
import type { PbrExtension } from './PbrExtension';
import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';

// Metallic-roughness PBR plus an ordered set of independently registered contributions. Extension
// order is semantic: backends compose shader source and bind inputs in this order after rejecting
// duplicate kinds. The standard member is a property block, never a nested material Entity.
export interface ExtendedPbrMaterial extends Material3D {
  extensions: readonly PbrExtension[];
  readonly kind: 'ExtendedPbrMaterial';
  standard: StandardPbrMaterialProperties;
}

export const ExtendedPbrMaterialKind = 'ExtendedPbrMaterial';
