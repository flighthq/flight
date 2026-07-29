import type { ExtendedPbrMaterial } from '@flighthq/types/contract';
import { ExtendedPbrMaterialKind } from '@flighthq/types/contract';

import { createStandardPbrMaterialProperties } from './pbrMaterials';
import { createSurfaceMaterial } from './surfaceMaterial';

// Builds the composable PBR material lane. The ordered extension list is retained by reference so its
// identity and ordering remain an explicit batching/program-selection fact.
export function createExtendedPbrMaterial(opts?: Readonly<Partial<ExtendedPbrMaterial>>): ExtendedPbrMaterial {
  const material = createSurfaceMaterial(ExtendedPbrMaterialKind, opts) as ExtendedPbrMaterial;
  material.extensions = opts?.extensions ?? [];
  material.standard = opts?.standard ?? createStandardPbrMaterialProperties();
  return material;
}
