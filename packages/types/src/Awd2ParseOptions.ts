import type { Awd2BlockHandler } from './Awd2Block.ts';
import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from './Compression.ts';

/**
 * Everything an AWD2 import depends on, in one literal: the codecs it may need to reach the block
 * stream, and the block handlers it reads that stream with. Both are explicit inputs — there is no
 * ambient registry and no module-scoped state behind either.
 *
 * The codecs are named one at a time rather than taken as a whole Host, because these are the only
 * platform capabilities the importer uses and a parameter should ask for what it needs. A caller
 * reading uncompressed files supplies neither and writes `{ blocks }`.
 *
 * `blocks` is the tree-shaking boundary. A build that names geometry, scene structure and materials
 * reaches none of the animation, lighting or camera code; those packages are absent from the bundle
 * rather than merely unreferenced in it. Handlers compose by array spread, so a family is just
 * `readonly Awd2BlockHandler[]` and nests without a registry type.
 *
 * Block bodies are length-prefixed, so a file carrying blocks no named handler claims still walks
 * correctly: the walk advances past an unclaimed body and reports it once per distinct type.
 */
export interface Awd2ParseOptions {
  /**
   * The handlers this import reads with. Array order is irrelevant — `parseAwd2` sorts build phases by
   * each handler's `buildPhase` number, so any permutation of the same handlers produces the same
   * document.
   */
  readonly blocks: readonly Awd2BlockHandler[];
  /**
   * Inflates a deflate-compressed body. Absent or null means such a file reports an unread body through
   * a diagnostic rather than throwing.
   */
  readonly deflate?: Readonly<HostDecompressDeflateCapability> | null;
  /** Decodes an LZMA-compressed body. Absent or null reports an unread body, as above. */
  readonly lzma?: Readonly<HostDecompressLzmaCapability> | null;
}
