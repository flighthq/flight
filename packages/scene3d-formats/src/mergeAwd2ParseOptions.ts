import type { Awd2ParseOptions } from '@flighthq/types/contract';

/**
 * Composes AWD2 parse-option fragments into one, field by field.
 *
 * Every field of `Awd2ParseOptions` is named explicitly, so adding one without deciding how it merges
 * fails here rather than silently taking the last fragment's value.
 *
 * - **`blocks` concatenates, in argument order.** AWD2's build phases genuinely depend on handler
 *   order — materials install the resolver scene structure reads, the skeleton builds the joints mesh
 *   instances bind to — so a merge that overwrote the list would yield a document with unparented
 *   lights or unskinned meshes rather than an error.
 * - **`deflate` and `lzma` are last-wins**, being single capabilities rather than collections.
 * - **`undefined` never overwrites.**
 */
export function mergeAwd2ParseOptions(...options: readonly Readonly<Partial<Awd2ParseOptions>>[]): Awd2ParseOptions {
  const blocks: Awd2ParseOptions['blocks'][number][] = [];
  let deflate: Awd2ParseOptions['deflate'];
  let lzma: Awd2ParseOptions['lzma'];
  for (const fragment of options) {
    if (fragment.blocks !== undefined) blocks.push(...fragment.blocks);
    if (fragment.deflate !== undefined) deflate = fragment.deflate;
    if (fragment.lzma !== undefined) lzma = fragment.lzma;
  }
  const merged: { -readonly [K in keyof Awd2ParseOptions]: Awd2ParseOptions[K] } = { blocks };
  if (deflate !== undefined) merged.deflate = deflate;
  if (lzma !== undefined) merged.lzma = lzma;
  return merged;
}
