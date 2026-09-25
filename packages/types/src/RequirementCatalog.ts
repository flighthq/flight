import type { Kind } from './Entity';
import type { Requirement } from './Requirement';
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

/**
 * One format-to-render implication: content that needs `from` also needs everything in `to`.
 *
 * A `document.format` requirement names a TAG (`swf.DefineShape`); a renderer is keyed by a NODE KIND
 * (`Shape`). Without this the two halves never meet, and a build resolves its parser handlers while
 * every render fragment comes back empty. Plain data rather than a function on purpose: a translator
 * handed only the requirement set would see exactly what a row sees, so code would buy nothing, and
 * data survives the JSON round trip the CLI lane depends on.
 *
 * MATCHING IS EXACT ON `from.key`, WITH ONE DELIBERATE EXCEPTION: a row whose key is a bare format
 * namespace (`swf` rather than `swf.DefineShape`) applies to every requirement in that namespace. That
 * is what carries the kinds a document produces REGARDLESS of its tags — the importer builds a
 * `MovieClip` root for any SWF — which no per-tag row can express. A file containing only
 * `SetBackgroundColor` still has that root, and a purely per-tag table would leave it unrendered.
 */
export interface RequirementTranslation {
  readonly from: Requirement;
  readonly to: readonly Requirement[];
}

/**
 * What one backend needs that the CONTENT does not choose, named so a generated module can import it.
 *
 * A manifest replaces exactly one part of a render configuration — the node renderers a document
 * implies. The rest is backend machinery (a shape-command table, a blend-mode application) that no
 * requirement can express, and some of it is not even kind-keyed. Naming it HERE rather than in the
 * plugin keeps the plugin ignorant of which render packages exist: it emits whatever the catalog
 * declares, so a caller with their own backend is served exactly like a built-in one.
 */
export interface RequirementBackend {
  readonly infrastructureImport: string;
  readonly infrastructureSymbol: string;
  readonly name: string;
}

// A caller-owned, open inventory. The built-in content is generated separately.
export interface RequirementCatalog {
  readonly entries: RequirementCatalogEntry[];
  /**
   * Per-backend machinery a complete configuration needs. Absent means the generated module offers
   * only the content-derived fragment, which is correct but is NOT a working render configuration.
   */
  readonly backends?: readonly RequirementBackend[];
  /** Format-to-render implications. Absent means a catalog that resolves render backends not at all. */
  readonly translations?: readonly RequirementTranslation[];
}
