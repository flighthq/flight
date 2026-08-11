import type { RegistryCatalogEntry } from './RegistryCatalog';
import type { Requirement } from './Requirement';

// Emission-neutral input to a future source writer. The kernel resolves factual ownership rows and
// reports gaps, but does not choose arguments, source expressions, or an ambient/caller-filled module.
export interface RegistryCodegenPlan {
  readonly backend: string;
  readonly entries: readonly Readonly<RegistryCatalogEntry>[];
  readonly unresolved: readonly Readonly<Requirement>[];
}
