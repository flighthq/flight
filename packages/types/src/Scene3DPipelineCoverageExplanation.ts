import type { Kind } from './Entity.ts';

export interface Scene3DPipelineCoverageExplanation {
  registeredKinds: readonly Kind[];
  registeredMaterialKinds: readonly Kind[];
  uncoveredKinds: readonly Kind[];
  uncoveredMaterialKinds: readonly Kind[];
  unusedMaterialRegistrations: readonly Kind[];
  unusedRegistrations: readonly Kind[];
  usedKinds: readonly Kind[];
  usedMaterialKinds: readonly Kind[];
}
