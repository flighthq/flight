import type { Requirement } from './Requirement';
import type { RequirementCatalogEntry } from './RequirementCatalog';

// Emission-neutral input to a future source writer. The kernel resolves factual ownership rows and
// reports gaps, but does not choose arguments, source expressions, or an ambient/caller-filled module.
export interface RequirementCodegenPlan {
  readonly backend: string;
  readonly entries: readonly Readonly<RequirementCatalogEntry>[];
  readonly unresolved: readonly Readonly<Requirement>[];
}
