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

  it('distributes space in proportion to unequal fraction tracks', () => {
    const out = resolve(
      [
        root({
          columns: [
            { fraction: 1, kind: 'fraction' },
            { fraction: 2, kind: 'fraction' },
          ],
          rows: [{ kind: 'fixed', size: 10 }],
        }),
        child({ column: 0, row: 0 }),
        child({ column: 1, row: 0 }),
      ],
      new Array(6).fill(0),
      180,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 60, 10]);
    expect([...out.slice(8)]).toEqual([60, 0, 120, 10]);
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

  it('accepts explicit zero container fields and an empty item style', () => {
    const out = resolve(
      [
        root({
          columnGap: 0,
          columns: [{ kind: 'fixed', size: 0 }],
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
          rowGap: 0,
          rows: [{ kind: 'fixed', size: 0 }],
        }),
        child({}),
      ],
      new Array(4).fill(0),
    );
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
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

  it('deducts fixed tracks and gaps from a spanning intrinsic contribution', () => {
    const out = resolve(
      [
        root({
          columnGap: 10,
          columns: [{ kind: 'auto' }, { kind: 'fixed', size: 30 }],
          rowGap: 5,
          rows: [{ kind: 'auto' }, { kind: 'fixed', size: 20 }],
        }),
        child({ column: 0, columnSpan: 2, row: 0, rowSpan: 2 }),
      ],
      [0, 0, 100, 70],
      173,
      119,
    );
    expect([...out.slice(4)]).toEqual([0, 0, 100, 70]);
  });

  it('does not deduct tracks outside an intrinsic item span', () => {
    const out = resolve(
      [
        root({ columns: [{ kind: 'auto' }, { kind: 'fixed', size: 30 }], rows: [{ kind: 'auto' }] }),
        child({ column: 0, row: 0 }),
      ],
      [0, 0, 100, 17],
      173,
      119,
    );
    expect([...out.slice(4)]).toEqual([0, 0, 100, 17]);
  });

  it('keeps intrinsic row and column sizing on their distinct axes', () => {
    const out = resolve(
      [
        root({
          columnGap: 7,
          columns: [{ kind: 'auto' }, { kind: 'auto' }],
          rowGap: 5,
          rows: [{ kind: 'auto' }, { kind: 'auto' }],
        }),
        child({ column: 0, row: 0 }),
        child({ column: 1, row: 0 }),
        child({ column: 0, row: 1 }),
      ],
      [0, 0, 70, 11, 23, 31, 41, 47],
      173,
      119,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 70, 31]);
    expect([...out.slice(8, 12)]).toEqual([77, 0, 23, 31]);
    expect([...out.slice(12)]).toEqual([0, 36, 70, 47]);
  });

  it('normalizes invalid intrinsic sizes for auto tracks', () => {
    const out = resolve(
      [root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), child()],
      [0, 0, Number.NaN, -1],
      173,
      119,
    );
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it('normalizes positive infinity in auto-track intrinsic sizes', () => {
    const out = resolve(
      [root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), child()],
      [0, 0, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
      173,
      119,
    );
    expect([...out.slice(4)]).toEqual([0, 0, 0, 0]);
  });

  it('resolves nested fractional rows and columns from asymmetric parent rectangles', () => {
    const nodes: LayoutNode[] = [
      root({
        columnGap: 5,
        columns: [
          { kind: 'fixed', size: 30 },
          { fraction: 1, kind: 'fraction' },
        ],
        paddingBottom: 17,
        paddingLeft: 7,
        paddingRight: 13,
        paddingTop: 11,
        rowGap: 3,
        rows: [
          { kind: 'fixed', size: 20 },
          { fraction: 2, kind: 'fraction' },
        ],
      }),
      {
        containerStyle: {
          columnGap: 2,
          columns: [
            { fraction: 1, kind: 'fraction' },
            { kind: 'fixed', size: 20 },
          ],
          paddingBottom: 8,
          paddingLeft: 4,
          paddingRight: 9,
          paddingTop: 6,
          rowGap: 5,
          rows: [
            { kind: 'fixed', size: 10 },
            { fraction: 3, kind: 'fraction' },
          ],
        },
        itemStyle: { column: 1, row: 1 },
        kind: GridLayoutKind,
        parentIndex: 0,
      },
      { ...child({ column: 0, row: 1 }), parentIndex: 1 },
    ];
    const out = resolve(nodes, new Array(6).fill(0), 200, 130);
    expect([...out.slice(4, 8)]).toEqual([42, 34, 145, 79]);
    expect([...out.slice(8)]).toEqual([46, 55, 110, 50]);
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

  it('rejects a span that exceeds the explicit grid', () => {
    const nodes = [
      root({ columns: [{ kind: 'auto' }, { kind: 'auto' }], rows: [{ kind: 'auto' }] }),
      child({ column: 1, columnSpan: 2, row: 0 }),
    ];
    const state = createLayoutState();
    registerGridLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
  });

  it('rejects a row span that exceeds the explicit grid', () => {
    const nodes = [
      root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }, { kind: 'auto' }] }),
      child({ column: 0, row: 1, rowSpan: 2 }),
    ];
    const state = createLayoutState();
    registerGridLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
  });

  it.each([
    null,
    { columns: [null], rows: [{ kind: 'auto' }] },
    { columns: [{ fraction: 0, kind: 'fraction' }], rows: [{ kind: 'auto' }] },
    { columns: [{ kind: 'fixed', size: -1 }], rows: [{ kind: 'auto' }] },
    { columns: [{ kind: 'auto' }], paddingLeft: Number.POSITIVE_INFINITY, rows: [{ kind: 'auto' }] },
  ])('rejects malformed container style %#', (containerStyle) => {
    const nodes = [{ ...root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), containerStyle }, child()];
    const state = createLayoutState();
    registerGridLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 0)?.kind).toBe('InvalidContainerStyle');
  });

  it.each([
    { column: -1, row: 0 },
    { column: 0.5, row: 0 },
    { column: '0', row: 0 },
    { column: 0, columnSpan: 0, row: 0 },
    { column: 0, row: 0, rowSpan: 0 },
  ])('rejects malformed item placement %#', (itemStyle) => {
    const nodes = [root({ columns: [{ kind: 'auto' }], rows: [{ kind: 'auto' }] }), { ...child(), itemStyle }];
    const state = createLayoutState();
    registerGridLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
  });
});
