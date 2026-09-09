import type { Kind } from './Entity';

export interface Scene2DPipelineCoverageExplanation {
  registeredKinds: readonly Kind[];
  uncoveredKinds: readonly Kind[];
  unusedRegistrations: readonly Kind[];
  usedKinds: readonly Kind[];
}
