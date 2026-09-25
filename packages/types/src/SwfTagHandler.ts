import type { AudioResourceReference } from './AudioResourceReference.ts';
import type { ImageResourceReference } from './ImageResourceReference.ts';
import type { ImportDiagnostic } from './ImportDiagnostic.ts';
import type { Node2D } from './Node2D.ts';
import type { SwfJpegAlphaPayload } from './SwfDocumentImport.ts';
import type {
  SwfTagParseResult,
  SwfTagParseState,
  SwfTagReader,
  SwfTagRectangle,
  SwfTagTimelineState,
  SwfTimeline,
} from './SwfTagParseState.ts';

/**
 * One SWF tag handler — the independently importable primitive a caller opts into. A handler covers a
 * related set of tags together with the phases they own: naming it in `SwfParseOptions.tags` is what
 * pulls its parsing, its post-parse resolution, and its resource and node construction into a build,
 * and leaving it out is what keeps the packages behind those phases out of the bundle entirely.
 *
 * A family is not a separate type — it is `readonly SwfTagHandler[]`, composed by array spread. So a
 * handler and a family differ only in arity, and both are named the same way at the call site.
 *
 * Tag bodies are length-prefixed, so a document containing tags no registered family claims still walks
 * correctly: the reader advances past an unclaimed body without interpreting it.
 */
export interface SwfTagHandler {
  /**
   * Builds the document-level resources and placed nodes this family's definitions produce. Absent for
   * a family whose tags only contribute to the timeline or to other families' definitions.
   */
  readonly instantiate?: SwfTagHandlerInstantiation;
  /** Every tag code this family claims. Expanded once into the importer's flat dispatch table. */
  readonly tags: readonly number[];
  /**
   * Reads one tag body of this family. Returns false to abort the whole timeline, which is reserved for
   * a structural failure the stream cannot be walked past; a payload this family cannot interpret
   * degrades through a diagnostic and returns true.
   */
  parse(
    body: SwfTagReader,
    tag: number,
    state: SwfTagParseState,
    timeline: SwfTagTimelineState,
    diagnostics: ImportDiagnostic[] | undefined,
  ): boolean;
  /**
   * Completes one timeline once its tag stream has been walked — the root's and each DefineSprite's.
   * This is the per-timeline counterpart to `resolve`: it runs for state a nested timeline accumulates
   * on its own, such as the stream audio blocks interleaved with its frames.
   */
  finishTimeline?(state: SwfTagParseState, timeline: SwfTagTimelineState): void;
  /**
   * Completes this family's cross-tag work once the whole file has been walked, with the root timeline.
   * Definitions routinely appear after the tags that reference them — a text record names a font
   * declared later, a script binds to a character `SymbolClass` names later — so this is where a family
   * that cannot finish at the tag finishes.
   */
  resolve?(state: SwfTagParseState, timeline: SwfTimeline): void;
}

/**
 * The scene-construction half of a family: what its definitions become once the file is parsed. Kept
 * apart from parsing because the two carry different dependencies — a family can read its tags without
 * the packages that turn them into resources, and a caller that only wants the tag census pays for
 * neither.
 */
export interface SwfTagHandlerInstantiation {
  /** Appends the document-level resources this family's definitions produce. */
  createResources?(parsed: Readonly<SwfTagParseResult>, out: SwfTagHandlerResources): void;
  /**
   * Builds the node one placement of `characterId` becomes, or null when this family did not define
   * that character. `bounds` is the character's resolved authored extent, or null when it has none.
   */
  createPlacementNode?(
    parsed: Readonly<SwfTagParseResult>,
    characterId: number,
    bounds: Readonly<SwfTagRectangle> | null,
    diagnostics: ImportDiagnostic[] | undefined,
  ): Node2D | null;
  /**
   * True when this family defined visual content for `characterId`. A placement of a character nothing
   * defines earns no node unless it is named, so this is asked before any node is built.
   */
  hasPlacementContent?(parsed: Readonly<SwfTagParseResult>, characterId: number): boolean;
}

/**
 * The document-level resources every named handler contributes to, in the order the importer asks for
 * them. Each list stays empty when the handler that fills it is not named.
 */
export interface SwfTagHandlerResources {
  audio: AudioResourceReference[];
  images: ImageResourceReference[];
  jpegAlphaPayloads: SwfJpegAlphaPayload[];
}

/**
 * The flat tag-code dispatch table the importer walks a tag stream with. The parser expands the
 * caller's handler array into this once per import, so the per-tag cost is one lookup rather than a
 * scan over handlers however many are named.
 */
export type SwfTagHandlerDispatch = ReadonlyMap<number, Readonly<SwfTagHandler>>;
