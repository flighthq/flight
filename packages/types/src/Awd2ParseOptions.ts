import type { Awd2BlockHandler } from './Awd2Block';
import type { Host } from './Host';

/**
 * Everything an AWD2 import depends on, in one literal: the platform capabilities it may call out to,
 * and the block handlers it reads content with. Both are explicit inputs — there is no ambient registry
 * and no module-scoped state behind either.
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
  /** Platform capabilities the import may use — decompression for a compressed body. A capability the
   * host does not carry degrades through a diagnostic rather than throwing. */
  readonly host: Readonly<Host>;
  /**
   * The handlers this import reads with. **Array order is the build order**, and AWD2's build phases
   * genuinely depend on each other: materials install the resolver scene structure reads, the skeleton
   * builds the joint nodes mesh instances bind to, and scene structure creates the nodes lighting and
   * camera parent themselves to. Ordering handlers wrongly yields a document with unparented lights or
   * unskinned meshes rather than an error, so prefer `awd2AllBlockHandlers` or the family arrays, which
   * are already in that order.
   */
  readonly blocks: readonly Awd2BlockHandler[];
}
