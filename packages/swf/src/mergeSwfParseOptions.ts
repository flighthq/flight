import type { SwfParseOptions } from '@flighthq/types/contract';

/**
 * Composes SWF parse-option fragments into one, field by field.
 *
 * Every field of `SwfParseOptions` is named explicitly. A generic merge would have to guess how each
 * composes and would guess silently; naming them means a new field on `SwfParseOptions` surfaces here
 * as a compile error and a failing exhaustiveness test rather than as a value that quietly disappears.
 *
 * - **`tags` concatenates, in argument order.** The handler list is ORDERED and SWF resolves a
 *   contested tag to the LAST handler named, so overwriting instead of concatenating would drop every
 *   file's handlers but the last — and change which handler wins for the ones that survived.
 * - **`deflate` and `lzma` are last-wins.** A decompressor is one capability the caller supplies, not
 *   a collection to accumulate.
 * Fragments are PARTIAL — a per-file fragment states only what that file needs — while the result is a
 * complete options object, so the ordered handler list is always present even when no fragment named one.
 *
 * - **`undefined` never overwrites**, so a fragment silent about a field differs from one that
 *   explicitly sets it to null.
 */
export function mergeSwfParseOptions(...options: readonly Readonly<Partial<SwfParseOptions>>[]): SwfParseOptions {
  const tags: SwfParseOptions['tags'][number][] = [];
  let deflate: SwfParseOptions['deflate'];
  let lzma: SwfParseOptions['lzma'];
  for (const fragment of options) {
    if (fragment.tags !== undefined) tags.push(...fragment.tags);
    if (fragment.deflate !== undefined) deflate = fragment.deflate;
    if (fragment.lzma !== undefined) lzma = fragment.lzma;
  }
  const merged: { -readonly [K in keyof SwfParseOptions]: SwfParseOptions[K] } = { tags };
  if (deflate !== undefined) merged.deflate = deflate;
  if (lzma !== undefined) merged.lzma = lzma;
  return merged;
}
