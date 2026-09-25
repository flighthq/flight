import type { Awd2ParseOptions } from '@flighthq/types/contract';

import { mergeAwd2ParseOptions } from './mergeAwd2ParseOptions.ts';

// Every field Awd2ParseOptions declares. Adding one fails the exhaustiveness test until someone decides
// how it composes, which is the drift alarm a generic merge would have hidden.
const ALL_FIELDS = ['deflate', 'lzma', 'blocks'] as const;

describe('mergeAwd2ParseOptions', () => {
  it('covers every field Awd2ParseOptions declares', () => {
    const probe: Required<Awd2ParseOptions> = { deflate: null, lzma: null, blocks: [] };
    expect(Object.keys(probe).sort()).toEqual([...ALL_FIELDS].sort());
  });

  it('concatenates blocks in argument order, because the build phases depend on handler order', () => {
    const a = handler('a');
    const b = handler('b');
    expect(mergeAwd2ParseOptions({ blocks: [a] }, { blocks: [b] }).blocks).toEqual([a, b]);
  });

  it('composes three documents in one call, preserving the order they were given', () => {
    const a = handler('a');
    const b = handler('b');
    const c = handler('c');
    expect(mergeAwd2ParseOptions({ blocks: [a] }, { blocks: [b] }, { blocks: [c] }).blocks).toEqual([a, b, c]);
  });

  it('keeps multi-handler fragments intact, not just their first entry', () => {
    const [a, b, c, d] = [handler('a'), handler('b'), handler('c'), handler('d')];
    expect(mergeAwd2ParseOptions({ blocks: [a, b] }, { blocks: [c, d] }).blocks).toEqual([a, b, c, d]);
  });

  it('is order-sensitive: swapping the fragments swaps the build order', () => {
    const a = handler('a');
    const b = handler('b');
    expect(mergeAwd2ParseOptions({ blocks: [a] }, { blocks: [b] }).blocks).not.toEqual(
      mergeAwd2ParseOptions({ blocks: [b] }, { blocks: [a] }).blocks,
    );
  });

  it('lets an empty fragment pass through without disturbing build order', () => {
    const a = handler('a');
    const b = handler('b');
    expect(mergeAwd2ParseOptions({ blocks: [a] }, { blocks: [] }, { blocks: [b] }).blocks).toEqual([a, b]);
  });

  it('keeps a duplicate handler, because position is the caller’s statement', () => {
    const a = handler('a');
    expect(mergeAwd2ParseOptions({ blocks: [a] }, { blocks: [a] }).blocks).toEqual([a, a]);
  });

  it('always reports a blocks array, even with no fragments', () => {
    expect(mergeAwd2ParseOptions().blocks).toEqual([]);
    expect(mergeAwd2ParseOptions({ deflate: null }).blocks).toEqual([]);
  });

  it.each(['deflate', 'lzma'] as const)('takes the last stated %s', (field) => {
    const first = { decompress: () => null } as never;
    const second = { decompress: () => null } as never;
    expect(mergeAwd2ParseOptions({ [field]: first }, { [field]: second })[field]).toBe(second);
  });

  it.each(['deflate', 'lzma'] as const)('leaves %s untouched when a later fragment omits it', (field) => {
    const stated = { decompress: () => null } as never;
    expect(mergeAwd2ParseOptions({ [field]: stated }, { blocks: [] })[field]).toBe(stated);
  });

  it.each(['deflate', 'lzma'] as const)('omits %s entirely when no fragment states it', (field) => {
    expect(field in mergeAwd2ParseOptions({ blocks: [] })).toBe(false);
  });

  it('distinguishes an omitted capability from one explicitly set to null', () => {
    const stated = { decompress: () => null } as never;
    expect(mergeAwd2ParseOptions({ deflate: stated }, { deflate: null }).deflate).toBeNull();
  });

  it('does not alias an input array into the result', () => {
    const input = [handler('a')];
    expect(mergeAwd2ParseOptions({ blocks: input }).blocks).not.toBe(input);
  });
});

function handler(name: string) {
  return { type: 1, name } as never;
}
