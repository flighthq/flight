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

  it('wraps lines and supports wrap-reverse', () => {
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
    expect(reversed[5]).toBe(45);
    expect(reversed[9]).toBe(60);
  });

  it('returns a diagnosable sentinel for mismatched styles', () => {
    const nodes = [root(), { ...child(), itemStyle: { grow: 'yes' } }];
    const state = createLayoutState();
    registerFlexLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, { nodes }, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, { nodes }, 1)?.kind).toBe('InvalidItemStyle');
  });
});
