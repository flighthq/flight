import type { DomRenderOptions } from '@flighthq/types/contract';

import { mergeDomRenderOptions } from './mergeDomRenderOptions.ts';

// Every field DomRenderOptions declares. Adding one fails the exhaustiveness test until someone
// decides how it composes — the drift alarm a generic deep merge would have hidden.
const MAP_FIELDS = ['canvasShapeCommands', 'effectPaddingResolvers', 'nodeRenderers', 'textureResolvers'] as const;
const LAST_WINS_FIELDS = [
  'imageSmoothingEnabled',
  'pixelRatio',
  'roundPixels',
  'sceneGraphSyncPolicy',
  'shapeRasterizer',
  'strokeTessellator',
] as const;

describe('mergeDomRenderOptions', () => {
  it('covers every field DomRenderOptions declares', () => {
    const probe: Required<DomRenderOptions> = {
      canvasShapeCommands: new Map(),
      effectPaddingResolvers: new Map(),
      imageSmoothingEnabled: true,
      nodeRenderers: new Map(),
      pixelRatio: 1,
      roundPixels: false,
      sceneGraphSyncPolicy: 'refreshDerivedState',
      shapeRasterizer: (() => null) as never,
      strokeTessellator: (() => null) as never,
      textureResolvers: new Map(),
    };
    expect(Object.keys(probe).sort()).toEqual([...MAP_FIELDS, ...LAST_WINS_FIELDS].sort());
  });

  it.each(MAP_FIELDS)('merges %s so entries from both fragments survive', (field) => {
    const merged = mergeDomRenderOptions(
      { [field]: new Map([['A', 'first']]) } as never,
      { [field]: new Map([['B', 'second']]) } as never,
    );
    expect([...(merged[field] as unknown as Map<string, string>).keys()]).toEqual(['A', 'B']);
  });

  it.each(MAP_FIELDS)('lets a later fragment win per key in %s', (field) => {
    const merged = mergeDomRenderOptions(
      { [field]: new Map([['A', 'first']]) } as never,
      { [field]: new Map([['A', 'second']]) } as never,
    );
    expect((merged[field] as unknown as Map<string, string>).get('A')).toBe('second');
  });

  it.each(MAP_FIELDS)('does not alias an input map into the result for %s', (field) => {
    const input = new Map([['A', 'first']]);
    const merged = mergeDomRenderOptions({ [field]: input } as never);
    (merged[field] as unknown as Map<string, string>).set('B', 'added');
    expect([...input.keys()]).toEqual(['A']);
  });

  it.each(LAST_WINS_FIELDS)('takes the last stated value for %s', (field) => {
    const merged = mergeDomRenderOptions({ [field]: 1 } as never, { [field]: 2 } as never);
    expect(merged[field]).toBe(2);
  });

  it.each([...MAP_FIELDS, ...LAST_WINS_FIELDS])('leaves %s untouched when a later fragment omits it', (field) => {
    expect(mergeDomRenderOptions({ [field]: new Map([['A', 'v']]) } as never, {})[field]).toBeDefined();
  });

  it('returns an empty object for no fragments', () => {
    expect(mergeDomRenderOptions()).toEqual({});
  });
});
