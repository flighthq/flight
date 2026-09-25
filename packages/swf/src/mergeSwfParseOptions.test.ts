import type { SwfParseOptions } from '@flighthq/types/contract';

import { mergeSwfParseOptions } from './mergeSwfParseOptions.ts';

// Every field SwfParseOptions declares. Adding one fails the exhaustiveness test until someone decides
// how it composes, which is the drift alarm a generic merge would have hidden.
const ALL_FIELDS = ['deflate', 'lzma', 'tags'] as const;

describe('mergeSwfParseOptions', () => {
  it('covers every field SwfParseOptions declares', () => {
    const probe: Required<SwfParseOptions> = { deflate: null, lzma: null, tags: [] };
    expect(Object.keys(probe).sort()).toEqual([...ALL_FIELDS].sort());
  });

  it('concatenates tags in argument order, because the last handler named wins a contested tag', () => {
    const a = handler('a');
    const b = handler('b');
    expect(mergeSwfParseOptions({ tags: [a] }, { tags: [b] }).tags).toEqual([a, b]);
  });

  it('keeps a duplicate handler, because position is the caller’s statement', () => {
    const a = handler('a');
    expect(mergeSwfParseOptions({ tags: [a] }, { tags: [a] }).tags).toEqual([a, a]);
  });

  it('always reports a tags array, even with no fragments', () => {
    expect(mergeSwfParseOptions().tags).toEqual([]);
    expect(mergeSwfParseOptions({ deflate: null }).tags).toEqual([]);
  });

  it.each(['deflate', 'lzma'] as const)('takes the last stated %s', (field) => {
    const first = { decompress: () => null } as never;
    const second = { decompress: () => null } as never;
    expect(mergeSwfParseOptions({ [field]: first }, { [field]: second })[field]).toBe(second);
  });

  it.each(['deflate', 'lzma'] as const)('leaves %s untouched when a later fragment omits it', (field) => {
    const stated = { decompress: () => null } as never;
    expect(mergeSwfParseOptions({ [field]: stated }, { tags: [] })[field]).toBe(stated);
  });

  it.each(['deflate', 'lzma'] as const)('omits %s entirely when no fragment states it', (field) => {
    expect(field in mergeSwfParseOptions({ tags: [] })).toBe(false);
  });

  it('distinguishes an omitted capability from one explicitly set to null', () => {
    const stated = { decompress: () => null } as never;
    expect(mergeSwfParseOptions({ deflate: stated }, { deflate: null }).deflate).toBeNull();
  });

  it('does not alias an input array into the result', () => {
    const input = [handler('a')];
    expect(mergeSwfParseOptions({ tags: input }).tags).not.toBe(input);
  });
});

function handler(name: string) {
  return { code: 1, name } as never;
}
