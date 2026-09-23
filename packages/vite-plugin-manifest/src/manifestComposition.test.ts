import { mergeRenderOptions } from '@flighthq/render/contract';
import { mergeSwfParseOptions } from '@flighthq/swf/contract';
import type { RenderStateOptions, SwfParseOptions } from '@flighthq/types/contract';

// A build that imports two documents gets two fragments per backend, and composes them with the merge
// function the OWNING package exports — not with a generic merge living here. These tests pin that
// composition end to end: the fragments are the shape the plugin emits, and the result is what an
// application spreads into createRenderState / parseSwf.
describe('multi-file composition', () => {
  it('unions node renderers from two documents instead of letting the last file win', () => {
    const firstDocument: RenderStateOptions = { nodeRenderers: new Map([['ShowFrame', 'showFrameImpl' as never]]) };
    const secondDocument: RenderStateOptions = { nodeRenderers: new Map([['DefineShape', 'shapeImpl' as never]]) };
    const composed = mergeRenderOptions(firstDocument, secondDocument);
    expect([...composed.nodeRenderers!.keys()]).toEqual(['ShowFrame', 'DefineShape']);
  });

  it('concatenates parser handlers across documents, preserving import order', () => {
    const firstDocument: SwfParseOptions = { tags: ['showFrameHandler' as never] };
    const secondDocument: SwfParseOptions = { tags: ['shapeHandler' as never] };
    expect(mergeSwfParseOptions(firstDocument, secondDocument).tags).toEqual(['showFrameHandler', 'shapeHandler']);
  });

  it('keeps a document whose fragment is empty from erasing another document’s contribution', () => {
    const populated: RenderStateOptions = { nodeRenderers: new Map([['ShowFrame', 'impl' as never]]) };
    expect([...mergeRenderOptions(populated, {}).nodeRenderers!.keys()]).toEqual(['ShowFrame']);
    expect([...mergeRenderOptions({}, populated).nodeRenderers!.keys()]).toEqual(['ShowFrame']);
  });

  it('composes three documents in one call, in argument order', () => {
    const composed = mergeSwfParseOptions({ tags: ['a' as never] }, { tags: ['b' as never] }, { tags: ['c' as never] });
    expect(composed.tags).toEqual(['a', 'b', 'c']);
  });
});
