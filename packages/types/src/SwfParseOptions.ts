import type { HostDecompressDeflateCapability, HostDecompressLzmaCapability } from './Compression.ts';
import type { SwfTagHandler } from './SwfTagHandler.ts';

/**
 * Everything a SWF import depends on, in one literal: the codecs it may need to reach the tag stream,
 * and the tag handlers it reads that stream with. Both are explicit inputs — there is no ambient
 * registry and no module-scoped state behind either.
 *
 * The codecs are named one at a time rather than taken as a whole Host, because these are the only
 * platform capabilities the importer uses and a parameter should ask for what it needs. A caller
 * reading uncompressed documents supplies neither and writes `{ tags }`.
 *
 * `tags` is the tree-shaking boundary. A build that names one handler reaches only that handler's
 * parsing and construction; the packages behind every handler it does not name are absent from the
 * bundle rather than merely unreferenced in it. Handlers compose by array spread, so a family is just
 * `readonly SwfTagHandler[]` and nests without a registry type.
 *
 * Tag bodies are length-prefixed, so a document carrying tags no named handler claims still walks
 * correctly: the reader advances past an unclaimed body without interpreting it.
 */
export interface SwfParseOptions {
  /**
   * Inflates a `CWS` body. Absent or null means a zlib-compressed document reports the importer's null
   * sentinel rather than throwing — unreadable bytes, the same as a malformed file.
   */
  readonly deflate?: Readonly<HostDecompressDeflateCapability> | null;
  /** Decodes a `ZWS` body. Absent or null reports an unread container, as above. */
  readonly lzma?: Readonly<HostDecompressLzmaCapability> | null;
  /**
   * The handlers this import reads with, consulted in array order when a placed character has to
   * become a node. A tag claimed by more than one handler resolves to the last one named.
   */
  readonly tags: readonly SwfTagHandler[];
}
