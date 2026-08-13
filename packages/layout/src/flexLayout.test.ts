import type { FlexLayoutContainerStyle, FlexLayoutItemStyle, LayoutNode } from '@flighthq/types/contract';
import { FlexLayoutKind } from '@flighthq/types/contract';

import { registerFlexLayoutResolver } from './flexLayout';
import { createLayoutState } from './layoutState';
import { explainLayoutResolution, resolveLayoutTree } from './resolveLayoutTree';

function root(containerStyle: FlexLayoutContainerStyle | null = null): LayoutNode {
  return { containerStyle, itemStyle: null, kind: FlexLayoutKind, parentIndex: -1 };
}

function child(itemStyle: FlexLayoutItemStyle | null = null): LayoutNode {
  return { containerStyle: null, itemStyle, kind: FlexLayoutKind, parentIndex: 0 };
}

function resolve(nodes: LayoutNode[], intrinsicSizes: number[], width = 200, height = 100): Float32Array {
  const out = new Float32Array(nodes.length * 4);
  const state = createLayoutState();
  registerFlexLayoutResolver(state);
  expect(resolveLayoutTree(out, state, { nodes }, intrinsicSizes, width, height)).toBe(true);
  return out;
}

describe('registerFlexLayoutResolver', () => {
  it('uses intrinsic sizes for basis-auto and distributes growth', () => {
    const out = resolve([root({ align: 'start' }), child({ grow: 1 }), child({ grow: 2 })], [0, 0, 20, 10, 20, 15]);
    expect([...out.slice(4, 8)]).toEqual([0, 0, 73.33333587646484, 10]);
    expect(out[8]).toBeCloseTo(73.3333);
    expect(out[10]).toBeCloseTo(126.6667);
  });

  it('shrinks overflowing items in proportion to basis and shrink', () => {
    const out = resolve(
      [root({ align: 'start' }), child({ basis: 80, shrink: 1 }), child({ basis: 80, shrink: 1 })],
      [0, 0, 0, 10, 0, 10],
      100,
    );
    expect(out[6]).toBe(50);
    expect(out[8]).toBe(50);
    expect(out[10]).toBe(50);
  });

  it('redistributes shrink deficit after an item reaches zero', () => {
    const out = resolve(
      [root({ align: 'start' }), child({ basis: 100, shrink: 10 }), child({ basis: 100, shrink: 1 })],
      [0, 0, 0, 10, 0, 20],
      50,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 0, 10]);
    expect([...out.slice(8)]).toEqual([0, 0, 50, 20]);
  });

  it('preserves an item whose shrink factor is zero', () => {
    const out = resolve(
      [root({ align: 'start' }), child({ basis: 80, shrink: 0 }), child({ basis: 80, shrink: 1 })],
      [0, 0, 0, 10, 0, 20],
      100,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 80, 10]);
    expect([...out.slice(8)]).toEqual([80, 0, 20, 20]);
  });

  it('preserves overflow when every shrink factor is zero', () => {
    const out = resolve(
      [root({ align: 'start' }), child({ basis: 80, shrink: 0 }), child({ basis: 60, shrink: 0 })],
      [0, 0, 0, 10, 0, 20],
      100,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 80, 10]);
    expect([...out.slice(8)]).toEqual([80, 0, 60, 20]);
  });

  it('distinguishes a zero basis from basis-auto', () => {
    const out = resolve(
      [root({ align: 'start', justify: 'end' }), child({ basis: 0 }), child({ basis: 20 })],
      [0, 0, 30, 10, 0, 20],
      50,
    );
    expect([...out.slice(4, 8)]).toEqual([30, 0, 0, 10]);
    expect([...out.slice(8)]).toEqual([30, 0, 20, 20]);
  });

  it('accepts explicit zero numeric fields and an empty item style', () => {
    const out = resolve(
      [
        root({
          gap: 0,
          paddingBottom: 0,
          paddingLeft: 0,
          paddingRight: 0,
          paddingTop: 0,
        }),
        child({ basis: 0, grow: 0, shrink: 0 }),
        child({}),
      ],
      [0, 0, 30, 10, 20, 17],
      100,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 0, 70]);
    expect([...out.slice(8)]).toEqual([0, 0, 20, 70]);
  });

  it('stretches a null item style across the default cross axis', () => {
    const out = resolve([root(), child()], [0, 0, 20, 10], 137, 83);
    expect([...out.slice(4)]).toEqual([0, 0, 20, 83]);
  });

  it('uses container alignment for an explicit auto align-self', () => {
    const out = resolve([root({ align: 'end' }), child({ alignSelf: 'auto' })], [0, 0, 20, 17], 137, 83);
    expect([...out.slice(4)]).toEqual([0, 66, 20, 17]);
  });

  it('uses the default shrink factor in weighted overflow', () => {
    const out = resolve(
      [root({ align: 'start' }), child({ basis: 80 }), child({ basis: 80, shrink: 2 })],
      [0, 0, 0, 10, 0, 20],
      100,
    );
    expect(out[6]).toBe(60);
    expect(out[8]).toBe(60);
    expect(out[10]).toBe(40);
  });

  it('keeps one item at main-start for space-between', () => {
    const out = resolve([root({ align: 'start', justify: 'space-between' }), child({ basis: 20 })], [0, 0, 0, 10]);
    expect([...out.slice(4)]).toEqual([0, 0, 20, 10]);
  });

  it('normalizes an invalid intrinsic basis while honoring explicit stretch', () => {
    const out = resolve([root({ align: 'stretch' }), child()], [0, 0, Number.NaN, -1], 137, 83);
    expect([...out.slice(4)]).toEqual([0, 0, 0, 83]);
  });

  it.each([
    ['start', 0, 10],
    ['end', 70, 80],
    ['center', 35, 45],
    ['space-between', 0, 80],
    ['space-around', 17.5, 62.5],
    ['space-evenly', 70 / 3, 170 / 3],
  ] as const)('applies %s main-axis justification', (justify, firstX, secondX) => {
    const out = resolve(
      [root({ align: 'start', justify }), child({ basis: 10 }), child({ basis: 20 })],
      [0, 0, 0, 10, 0, 20],
      100,
    );
    expect(out[4]).toBeCloseTo(firstX);
    expect(out[8]).toBeCloseTo(secondX);
  });

  it('applies padding, gap, justify, and cross-axis alignment', () => {
    const out = resolve(
      [
        root({
          align: 'center',
          gap: 10,
          justify: 'space-between',
          paddingBottom: 10,
          paddingLeft: 10,
          paddingRight: 10,
          paddingTop: 10,
        }),
        child(),
        child({ alignSelf: 'end' }),
      ],
      [0, 0, 20, 10, 30, 20],
      120,
      80,
    );
    expect([...out.slice(4, 8)]).toEqual([10, 35, 20, 10]);
    expect([...out.slice(8)]).toEqual([80, 50, 30, 20]);
  });

  it('deducts asymmetric opposing padding from grown and stretched content', () => {
    const out = resolve(
      [
        root({
          paddingBottom: 17,
          paddingLeft: 13,
          paddingRight: 29,
          paddingTop: 7,
        }),
        child({ grow: 1 }),
      ],
      [0, 0, 0, 0],
      211,
      127,
    );
    expect([...out.slice(4)]).toEqual([13, 7, 169, 103]);
  });

  it('deducts asymmetric opposing padding for column layout', () => {
    const out = resolve(
      [
        root({
          direction: 'column',
          paddingBottom: 17,
          paddingLeft: 13,
          paddingRight: 29,
          paddingTop: 7,
        }),
        child({ grow: 1 }),
      ],
      [0, 0, 0, 0],
      211,
      127,
    );
    expect([...out.slice(4)]).toEqual([13, 7, 169, 103]);
  });

  it('deducts gaps before distributing growth', () => {
    const out = resolve(
      [root({ align: 'start', gap: 10 }), child({ basis: 10, grow: 1 }), child({ basis: 10, grow: 1 })],
      [0, 0, 0, 11, 0, 23],
      100,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 45, 11]);
    expect([...out.slice(8)]).toEqual([55, 0, 45, 23]);
  });

  it('keeps exact-fit items together when wrapping', () => {
    const out = resolve(
      [root({ align: 'start', gap: 10, wrap: 'wrap' }), child({ basis: 40 }), child({ basis: 50 })],
      [0, 0, 0, 11, 0, 23],
      100,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 40, 11]);
    expect([...out.slice(8)]).toEqual([50, 0, 50, 23]);
  });

  it('wraps when the gap alone pushes the next item past the line', () => {
    const out = resolve(
      [root({ align: 'start', gap: 10, wrap: 'wrap' }), child({ basis: 50 }), child({ basis: 45 })],
      [0, 0, 0, 11, 0, 23],
      100,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 0, 50, 11]);
    expect([...out.slice(8)]).toEqual([0, 21, 45, 23]);
  });

  it('keeps an oversized first item at the first cross-axis position', () => {
    const out = resolve(
      [root({ align: 'start', gap: 10, wrap: 'wrap' }), child({ basis: 120 })],
      [0, 0, 0, 17],
      100,
      70,
    );
    expect([...out.slice(4)]).toEqual([0, 0, 100, 17]);
  });

  it('distributes space-between across more than two items', () => {
    const out = resolve(
      [
        root({ align: 'start', justify: 'space-between' }),
        child({ basis: 10 }),
        child({ basis: 10 }),
        child({ basis: 10 }),
      ],
      [0, 0, 0, 10, 0, 20, 0, 30],
      100,
    );
    expect(out[4]).toBe(0);
    expect(out[8]).toBe(45);
    expect(out[12]).toBe(90);
  });

  it('supports column-reverse without changing item role semantics', () => {
    const out = resolve(
      [root({ align: 'start', direction: 'column-reverse', gap: 5 }), child(), child()],
      [0, 0, 20, 10, 30, 15],
      100,
      60,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 50, 20, 10]);
    expect([...out.slice(8)]).toEqual([0, 30, 30, 15]);
  });

  it('supports row-reverse without transposing the cross axis', () => {
    const out = resolve(
      [root({ align: 'start', direction: 'row-reverse', gap: 5 }), child(), child()],
      [0, 0, 10, 17, 20, 23],
      100,
      70,
    );
    expect([...out.slice(4, 8)]).toEqual([90, 0, 10, 17]);
    expect([...out.slice(8)]).toEqual([65, 0, 20, 23]);
  });

  it('applies a nonzero justify offset from row-reverse main-start', () => {
    const out = resolve(
      [root({ align: 'start', direction: 'row-reverse', justify: 'center' }), child({ basis: 20 })],
      [0, 0, 0, 17],
      100,
      70,
    );
    expect([...out.slice(4)]).toEqual([40, 0, 20, 17]);
  });

  it('resolves a nested column from an asymmetric flex parent rectangle', () => {
    const nodes: LayoutNode[] = [
      root({
        align: 'start',
        paddingBottom: 5,
        paddingLeft: 11,
        paddingRight: 13,
        paddingTop: 7,
      }),
      {
        containerStyle: {
          align: 'start',
          direction: 'column',
          paddingBottom: 5,
          paddingLeft: 3,
          paddingRight: 7,
          paddingTop: 4,
        },
        itemStyle: { basis: 100 },
        kind: FlexLayoutKind,
        parentIndex: 0,
      },
      { ...child({ basis: 20 }), parentIndex: 1 },
    ];
    const out = resolve(nodes, [0, 0, 0, 60, 17, 0], 200, 100);
    expect([...out.slice(4, 8)]).toEqual([11, 7, 100, 60]);
    expect([...out.slice(8)]).toEqual([14, 11, 17, 20]);
  });

  it('skips interleaved descendants when positioning later siblings', () => {
    const nodes: LayoutNode[] = [
      root({ align: 'start' }),
      {
        containerStyle: { align: 'start' },
        itemStyle: { basis: 20 },
        kind: FlexLayoutKind,
        parentIndex: 0,
      },
      { ...child({ basis: 5 }), parentIndex: 1 },
      child({ basis: 30 }),
    ];
    const out = resolve(nodes, [0, 0, 0, 10, 0, 4, 0, 17], 40, 60);
    expect([...out.slice(4, 8)]).toEqual([0, 0, 16, 10]);
    expect([...out.slice(8, 12)]).toEqual([0, 0, 5, 4]);
    expect([...out.slice(12)]).toEqual([16, 0, 24, 17]);
  });

  it('wraps lines and reverses their cross-axis direction for wrap-reverse', () => {
    const normal = resolve(
      [root({ align: 'start', gap: 5, wrap: 'wrap' }), child({ basis: 60 }), child({ basis: 60 })],
      [0, 0, 0, 10, 0, 20],
      100,
      80,
    );
    expect([...normal.slice(4, 8)]).toEqual([0, 0, 60, 10]);
    expect([...normal.slice(8)]).toEqual([0, 15, 60, 20]);

    const reversed = resolve(
      [root({ align: 'start', gap: 5, wrap: 'wrap-reverse' }), child({ basis: 60 }), child({ basis: 60 })],
      [0, 0, 0, 10, 0, 20],
      100,
      80,
    );
    expect(reversed[5]).toBe(70);
    expect(reversed[9]).toBe(45);

    const column = resolve(
      [
        root({ align: 'start', direction: 'column', gap: 5, wrap: 'wrap-reverse' }),
        child({ basis: 60 }),
        child({ basis: 60 }),
      ],
      [0, 0, 10, 0, 20, 0],
      90,
      100,
    );
    expect([...column.slice(4, 8)]).toEqual([80, 0, 10, 60]);
    expect([...column.slice(8)]).toEqual([55, 0, 20, 60]);
  });

  it('reverses start and end alignment within wrap-reverse lines', () => {
    const out = resolve(
      [
        root({ align: 'start', gap: 5, wrap: 'wrap-reverse' }),
        child({ basis: 40 }),
        child({ alignSelf: 'end', basis: 40 }),
        child({ basis: 60 }),
      ],
      [0, 0, 0, 10, 0, 20, 0, 30],
      100,
      90,
    );
    expect([...out.slice(4, 8)]).toEqual([0, 80, 40, 10]);
    expect([...out.slice(8, 12)]).toEqual([45, 70, 40, 20]);
    expect([...out.slice(12)]).toEqual([0, 35, 60, 30]);
  });

  it('returns a diagnosable sentinel for mismatched styles', () => {
    const nodes = [root(), { ...child(), itemStyle: { grow: 'yes' } }];
    const state = createLayoutState();
    registerFlexLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
  });

  it('rejects an invalid container enum', () => {
    const nodes = [{ ...root(), containerStyle: { direction: 'diagonal' } }, child()];
    const state = createLayoutState();
    registerFlexLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 0)?.kind).toBe('InvalidContainerStyle');
  });

  it.each([
    { align: 'middle' },
    { gap: -1 },
    { justify: 'edges' },
    { paddingBottom: Number.POSITIVE_INFINITY },
    { wrap: 'reverse' },
  ])('rejects malformed container field %#', (containerStyle) => {
    const nodes = [{ ...root(), containerStyle }, child()];
    const state = createLayoutState();
    registerFlexLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 0)?.kind).toBe('InvalidContainerStyle');
  });

  it.each([{ alignSelf: 'middle' }, { basis: -1 }, { grow: -1 }, { shrink: Number.NaN }])(
    'rejects malformed item field %#',
    (itemStyle) => {
      const nodes = [root(), { ...child(), itemStyle }];
      const state = createLayoutState();
      registerFlexLayoutResolver(state);
      expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
      expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
    },
  );

  it('normalizes positive infinity in an intrinsic basis', () => {
    const out = resolve([root({ align: 'start' }), child()], [0, 0, Number.POSITIVE_INFINITY, 17], 100, 70);
    expect([...out.slice(4)]).toEqual([0, 0, 0, 17]);
  });
});
