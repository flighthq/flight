import type { Host } from './Host';
import type { SwfTagHandler } from './SwfTagHandler';

/**
 * Everything a SWF import depends on, in one literal: the platform capabilities it may call out to,
 * and the tag handlers it reads content with. Both are explicit inputs — there is no ambient registry
 * and no module-scoped state behind either.
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
  /** Platform capabilities the import may use — decompression for a compressed file, image decoding
   * for bitmap tags. A capability the host does not carry degrades through a diagnostic. */
  readonly host: Readonly<Host>;
  /**
   * The handlers this import reads with, consulted in array order when a placed character has to
   * become a node. A tag claimed by more than one handler resolves to the last one named.
   */
  readonly tags: readonly SwfTagHandler[];
}
