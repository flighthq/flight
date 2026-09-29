import type { Kind } from './Entity.ts';
import type { Requirement } from './Requirement.ts';
import type { RequirementFacet } from './RequirementFacet.ts';

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
   * Where this row's implementation sits in its format's shipped handler family, or absent for a family
   * whose order carries no meaning.
   *
   * ★ THIS EXISTS BECAUSE A GENERATED SUBSET MUST NOT BE REORDERED. `createRequirementSet` canonicalizes
   * requirements by facet then key, so a codegen plan walks them alphabetically and a parser fragment
   * built from that arrives sorted by kind. For COLLADA that is a different parse, not a rearrangement of
   * the same one: `parseCollada` runs `options.decoders` in the order given, and materials must be indexed
   * before geometry reads the symbols naming them. Alphabetically, Geometry precedes Material.
   *
   * The number is derived from the family array at generate time, never written by hand, so it cannot
   * drift from the order the format package actually ships. A format whose importer re-sorts internally
   * (AWD2 sorts by build phase) has nothing to preserve and carries no value here.
   */
  readonly familyOrder?: number;
  /**
   * The parser options field this row's handler belongs to, when a format owns more than one handler
   * family. A Spine binary registry has both `sectionHandlers` and `timelineHandlers`; without this a
   * codegen that sees one field name per extension cannot split the rows. Absent means the format's
   * default field applies, which is the single-family case every other format uses today.
   */
  readonly parserField?: string;
  /**
   * The flat named binding a DIRECT-PARSER row is emitted as, instead of a `parserOptions` field.
   *
   * ★ THIS EXISTS BECAUSE SOME FORMATS HAVE NO HANDLER FAMILY TO SUBSET. Every other parser row spreads its
   * symbol into a field the format's own options type declares — `.dae` into `decoders`, `.swf` into `tags`.
   * A bedrock format has one parser and no family: `TilemapImportOptions` declares only `mapFormats` and
   * `tilesetFormats`, which are DESCRIPTOR LISTS FOR THE DETECTION REGISTRY, and `BitmapFontParseOptions`
   * declares nothing at all. Emitting into either would either install the registry — whose initializer seeds
   * the full preset, measured at 40,377 bytes carrying five codecs against 7,935 for one — or spread into a
   * field the format does not declare, which parses with the full default family while the generated module
   * looks correct.
   *
   * So the row names the parser itself, and the module emits `export const <parserExport> = <symbol>;`. It
   * selects IDENTITY and nothing more: the parser keeps its own signature, and no adapter or registry is
   * invented to make several of them interchangeable. A row carrying this never enters `parserOptions`.
   */
  readonly parserExport?: string;
  /**
   * Whether the direct parser this row names takes DECODED TEXT or the RAW BYTES as its first argument.
   *
   * ★ IT IS STATED, NOT SNIFFED, BECAUSE THE EMITTER CANNOT ASK THE FUNCTION. A generated `contentParser` has one
   * contract — `contentParser(bytes, ...rest)` — so that an application reads a file and calls it without knowing
   * which format the build selected. The parsers themselves disagree: `parseBitmapFontBinary` wants the bytes,
   * while `parseTiledTmx` and the rest want a string. Nothing about a symbol name or its module says which, and
   * guessing by extension would be exactly the content-vs-suffix mistake `.fnt` already taught. So the catalog
   * carries the fact, and a row whose parser changes shape changes its row.
   *
   * A `bytes` row is emitted as the direct binding. A `string` row is emitted as a wrapper that decodes and
   * forwards every remaining argument in order, so options, diagnostics and the parser's own return and sentinel
   * behavior are untouched.
   *
   * Meaningful only alongside `parserExport`; a handler row spreads into an options field and never becomes a
   * callable of its own.
   */
  readonly contentParserInputKind?: 'bytes' | 'string';
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

/**
 * A requirement a backend deliberately does not implement, and why.
 *
 * ★ WHAT THIS IS FOR, AND WHAT IT IS NOT. Two situations look identical to a build that only knows
 * "nothing resolved": nobody implemented this, and we chose not to. The first deserves a warning; the
 * second is a decision, and warning about it forever teaches a reader to ignore the channel that
 * reports the first. This records the second so the difference survives.
 *
 * It does NOT cover a requirement that never exists. A SWF `Metadata` tag produces no requirement at
 * all — nothing can implement metadata, so there is nothing to dispose of — and that stays filtered at
 * the producer. A disposition only ever applies to a requirement that genuinely reaches backend
 * resolution and could have been satisfied.
 *
 * EXACT, AND REASONED. The triple is matched exactly: one backend, one facet, one kind. No pattern, no
 * prefix, no wildcard — a broad matcher would silence requirements nobody considered, which is the
 * failure this exists to prevent rather than cause. `reason` is required and must be non-empty,
 * because a disposition with nothing to say is a suppression list.
 */
export interface RequirementDisposition {
  readonly backend: string;
  readonly facet: RequirementFacet;
  readonly kind: Kind;
  readonly reason: string;
}

// A caller-owned, open inventory. The built-in content is generated separately.
export interface RequirementCatalog {
  readonly entries: RequirementCatalogEntry[];
  /**
   * Per-backend machinery a complete configuration needs. Absent means the generated module offers
   * only the content-derived fragment, which is correct but is NOT a working render configuration.
   */
  readonly backends?: readonly RequirementBackend[];
  /**
   * Requirements a backend deliberately does not implement. Absent means every gap is reported, which
   * is the safe default: a build that says nothing about a gap it chose is indistinguishable from one
   * that overlooked it.
   */
  readonly dispositions?: readonly RequirementDisposition[];
  /** Format-to-render implications. Absent means a catalog that resolves render backends not at all. */
  readonly translations?: readonly RequirementTranslation[];
}
