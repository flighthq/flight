import type { Entity, Kind } from './Entity';
import type { RequirementFacet } from './RequirementFacet';

// One factual ownership row. It deliberately stops before argument/source expressions: those depend on
// whether generated registries are caller-filled or ambiently self-filling, while every field here is
// true under either outcome.
export interface RegistryCatalogEntry {
  readonly backend: string;
  readonly facet: RequirementFacet;
  readonly implementationImport: string;
  readonly implementationSymbol: string;
  readonly kind: Kind;
  readonly registrarImport: string;
  readonly registrarSymbol: string;
}

// A caller-owned, open inventory. The built-in content starts empty and is generated separately.
export interface RegistryCatalog extends Entity {
  readonly entries: RegistryCatalogEntry[];
}
