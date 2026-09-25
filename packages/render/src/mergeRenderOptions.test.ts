import type { RenderStateOptions } from '@flighthq/types/contract';

import { mergeRenderOptions } from './mergeRenderOptions.ts';

// Every field of RenderStateOptions, listed once. The exhaustiveness test below compares this against
// what the type actually declares, so ADDING A FIELD TO RenderStateOptions FAILS HERE until someone
// decides how it composes. That is the drift alarm: a silently unmerged field is the failure mode a
// generic deep merge would have hidden.
const MAP_FIELDS = ['canvasShapeCommands', 'effectPaddingResolvers', 'nodeRenderers'] as const;
const LAST_WINS_FIELDS = [
  'colorAdjustments',
  'colorAdjustmentUnsupportedGuard',
  'renderRootGuard',
  'strokeTessellator',
] as const;

describe('mergeRenderOptions', () => {
  it('covers every field RenderStateOptions declares', () => {
    const probe: Required<RenderStateOptions> = {
      canvasShapeCommands: new Map(),
      colorAdjustments: null,
      colorAdjustmentUnsupportedGuard: null,
      effectPaddingResolvers: new Map(),
      nodeRenderers: new Map(),
      renderRootGuard: null,
      strokeTessellator: null,
    };
    expect(Object.keys(probe).sort()).toEqual([...MAP_FIELDS, ...LAST_WINS_FIELDS].sort());
  });

  it.each(MAP_FIELDS)('merges %s so entries from both fragments survive', (field) => {
    const merged = mergeRenderOptions(
      { [field]: new Map([['A', 'first']]) } as never,
      { [field]: new Map([['B', 'second']]) } as never,
    );
    expect([...(merged[field] as unknown as Map<string, string>).entries()]).toEqual([
      ['A', 'first'],
      ['B', 'second'],
    ]);
  });

  it.each(MAP_FIELDS)('lets a later fragment win per key in %s', (field) => {
    const merged = mergeRenderOptions(
      { [field]: new Map([['A', 'first']]) } as never,
      { [field]: new Map([['A', 'second']]) } as never,
    );
    expect((merged[field] as unknown as Map<string, string>).get('A')).toBe('second');
  });

  it.each(MAP_FIELDS)('does not alias an input map into the result for %s', (field) => {
    const input = new Map([['A', 'first']]);
    const merged = mergeRenderOptions({ [field]: input } as never);
    (merged[field] as unknown as Map<string, string>).set('B', 'added');
    expect([...input.keys()]).toEqual(['A']);
  });

  it.each(LAST_WINS_FIELDS)('takes the last stated value for %s', (field) => {
    const first = (() => null) as never;
    const second = (() => null) as never;
    expect(mergeRenderOptions({ [field]: first } as never, { [field]: second } as never)[field]).toBe(second);
  });

  it.each([...MAP_FIELDS, ...LAST_WINS_FIELDS])('leaves %s untouched when a later fragment omits it', (field) => {
    const stated = mergeRenderOptions({ [field]: new Map([['A', 'v']]) } as never, {});
    expect(stated[field]).toBeDefined();
  });

  it('distinguishes an omitted field from one explicitly set to null', () => {
    const tessellator = (() => null) as never;
    expect(mergeRenderOptions({ strokeTessellator: tessellator }, {}).strokeTessellator).toBe(tessellator);
    expect(mergeRenderOptions({ strokeTessellator: tessellator }, { strokeTessellator: null }).strokeTessellator).toBe(
      null,
    );
  });

  it('returns an empty object for no fragments', () => {
    expect(mergeRenderOptions()).toEqual({});
  });
});
