import type { Kind } from './Entity';
import type { RequirementFacet } from './RequirementFacet';

// One factual ownership row. It deliberately stops before argument/source expressions: those depend on
// whether generated registries are caller-filled or ambiently self-filling, while every field here is
// true under either outcome.
export interface RequirementCatalogEntry {
  readonly backend: string;
  readonly facet: RequirementFacet;
  readonly implementationImport: string;
  readonly implementationSymbol: string;
  readonly kind: Kind;
  /**
   * The `register*` that binds the implementation, for a backend that HAS one. Absent for an
   * options-driven lane: a SWF tag family is named in `SwfParseOptions.tags` and an AWD2 handler in
   * `Awd2ParseOptions.blocks`, so there is no registrar to name and a row that invented one would be
   * false. Nothing emits these fields today — they are carried as ownership fact and folded into the
   * row identity — so requiring them would buy nothing and cost the truth of every parser row.
   */
  readonly registrarImport?: string;
  readonly registrarSymbol?: string;
}

// A caller-owned, open inventory. The built-in content starts empty and is generated separately.
export interface RequirementCatalog {
  readonly entries: RequirementCatalogEntry[];
}
