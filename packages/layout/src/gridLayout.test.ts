import type { GridLayoutContainerStyle, GridLayoutItemStyle, LayoutNode } from '@flighthq/types/contract';
import { GridLayoutKind } from '@flighthq/types/contract';

import { registerGridLayoutResolver } from './gridLayout';
import { createLayoutState } from './layoutState';
import { explainLayoutResolution, resolveLayoutTree } from './resolveLayoutTree';

function root(containerStyle: GridLayoutContainerStyle): LayoutNode {
  return { containerStyle, itemStyle: null, kind: GridLayoutKind, parentIndex: -1 };
}

function child(itemStyle: GridLayoutItemStyle | null = null): LayoutNode {
  return { containerStyle: null, itemStyle, kind: GridLayoutKind, parentIndex: 0 };
}

function resolve(nodes: LayoutNode[], intrinsicSizes: number[], width = 200, height = 100): Float32Array {
  const out = new Float32Array(nodes.length * 4);
  const state = createLayoutState();
  registerGridLayoutResolver(state);
  expect(resolveLayoutTree(out, state, { nodes }, intrinsicSizes, width, height)).toBe(true);
  return out;
}

describe('registerGridLayoutResolver', () => {
  it('sizes fixed, fractional, and intrinsic tracks', () => {
    const out = resolve(
      [
        root({
          columnGap: 10,
          columns: [{ kind: 'fixed', size: 40 }, { kind: 'auto' }, { fraction: 1, kind: 'fraction' }],
          rows: [{ kind: 'auto' }],
        }),
        child({ column: 0, row: 0 }),
        child({ column: 1, row: 0 }),
        child({ column: 2, row: 0 }),
      ],
      [0, 0, 20, 10, 30, 25, 15, 20],
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 40, 25]);
    expect([...out.slice(8, 12)]).toEqual([50, 0, 30, 25]);
    expect([...out.slice(12)]).toEqual([90, 0, 110, 25]);
  });

  it('assigns omitted placement row-major', () => {
    const out = resolve(
      [
        root({
          columnGap: 5,
          columns: [
            { kind: 'fixed', size: 20 },
            { kind: 'fixed', size: 30 },
          ],
          rowGap: 4,
          rows: [
            { kind: 'fixed', size: 10 },
            { kind: 'fixed', size: 15 },
          ],
        }),
        child(),
        child(),
        child(),
      ],
      new Array(8).fill(0),
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 20, 10]);
    expect([...out.slice(8, 12)]).toEqual([25, 0, 30, 10]);
    expect([...out.slice(12)]).toEqual([0, 14, 20, 15]);
  });

  it('supports spans, padding, and independent gaps', () => {
    const out = resolve(
      [
        root({
          columnGap: 5,
          columns: [
            { kind: 'fixed', size: 20 },
            { kind: 'fixed', size: 30 },
          ],
          paddingLeft: 7,
          paddingTop: 11,
          rowGap: 3,
          rows: [
            { kind: 'fixed', size: 10 },
            { kind: 'fixed', size: 15 },
          ],
        }),
        child({ column: 0, columnSpan: 2, row: 0, rowSpan: 2 }),
      ],
      [0, 0, 0, 0],
    );
    expect([...out.slice(4)]).toEqual([7, 11, 55, 28]);
  });

  it('shares intrinsic size across auto tracks in a span', () => {
    const out = resolve(
      [
        root({ columns: [{ kind: 'auto' }, { kind: 'auto' }], rows: [{ kind: 'auto' }] }),
        child({ column: 0, columnSpan: 2, row: 0 }),
      ],
      [0, 0, 80, 20],
    );
    expect([...out.slice(4)]).toEqual([0, 0, 80, 20]);
  });

  it('returns diagnosable sentinels for mismatched container and item styles', () => {
    const invalidContainerNodes = [
      { ...root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), containerStyle: { columns: [] } },
      child(),
    ];
    const state = createLayoutState();
    registerGridLayoutResolver(state);
    expect(
      resolveLayoutTree(new Float32Array(8), state, { nodes: invalidContainerNodes }, new Float32Array(4), 10, 10),
    ).toBe(false);
    expect(explainLayoutResolution(state, { nodes: invalidContainerNodes }, 0)?.kind).toBe('InvalidContainerStyle');

    const invalidItemNodes = [root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), child({ column: 0 })];
    expect(
      resolveLayoutTree(new Float32Array(8), state, { nodes: invalidItemNodes }, new Float32Array(4), 10, 10),
    ).toBe(false);
    expect(explainLayoutResolution(state, { nodes: invalidItemNodes }, 1)?.kind).toBe('InvalidItemStyle');
  });
});
