import type { Kind } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';

// One public registration call that can satisfy a catalog entry. Registrations are ordered: the first
// one is the primary remedy surfaced by SceneCoverageEntry, while diagnostics may show the full list.
export interface CatalogRegistration {
  readonly module: string;
  readonly registrar: string;
}

// Consumer-shaped ownership data. Producers discover or generate these rows, but diagnostics define
// their stable shape so a different inventory instrument does not change every explain* signature.
export interface CatalogEntry {
  readonly kind: Kind;
  readonly registrations: readonly CatalogRegistration[];
  readonly registry: RenderRegistry;
}

// A caller supplies the complete catalog for the backend being explained. It stays data rather than a
// lookup object so generated, probed, and caller-authored inventories are interchangeable producers.
export type SceneCoverageCatalog = readonly CatalogEntry[];
