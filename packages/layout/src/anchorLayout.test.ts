import type { AnchorLayoutItemStyle, LayoutNode, LayoutTree } from '@flighthq/types/contract';
import { AnchorLayoutKind } from '@flighthq/types/contract';

import { registerAnchorLayoutResolver } from './anchorLayout';
import { createLayoutState } from './layoutState';
import { explainLayoutResolution, resolveLayoutTree } from './resolveLayoutTree';

function node(parentIndex: number, itemStyle: AnchorLayoutItemStyle | null = null): LayoutNode {
  return { containerStyle: null, itemStyle, kind: AnchorLayoutKind, parentIndex };
}

function resolve(nodes: LayoutNode[], intrinsicSizes: number[], width = 200, height = 100): Float32Array {
  const out = new Float32Array(nodes.length * 4);
  const state = createLayoutState();
  registerAnchorLayoutResolver(state);
  expect(resolveLayoutTree(out, state, { nodes }, intrinsicSizes, width, height)).toBe(true);
  return out;
}

describe('registerAnchorLayoutResolver', () => {
  it('aligns a natural-size child with the existing viewport vocabulary', () => {
    const out = resolve([node(-1), node(0, { align: 'bottomright' })], [0, 0, 40, 20]);
    expect([...out.slice(4)]).toEqual([160, 80, 40, 20]);
  });

  it('stretches between opposing pins as the available rect changes', () => {
    const nodes = [node(-1), node(0, { bottom: 10, left: 20, right: 30, top: 5 })];
    expect([...resolve(nodes, [0, 0, 1, 1], 200, 100).slice(4)]).toEqual([20, 5, 150, 85]);
    expect([...resolve(nodes, [0, 0, 1, 1], 300, 160).slice(4)]).toEqual([20, 5, 250, 145]);
  });

  it('lets an edge pin override alignment on only that axis', () => {
    const out = resolve([node(-1), node(0, { align: 'bottomright', left: 12 })], [0, 0, 30, 20]);
    expect([...out.slice(4)]).toEqual([12, 80, 30, 20]);
  });

  it('propagates nested rectangles in one parent-before-child pass', () => {
    const out = resolve(
      [node(-1), node(0, { bottom: 10, left: 10, right: 10, top: 10 }), node(1, { align: 'bottomright' })],
      [0, 0, 0, 0, 20, 15],
    );
    expect([...out.slice(4, 8)]).toEqual([10, 10, 180, 80]);
    expect([...out.slice(8)]).toEqual([170, 75, 20, 15]);
  });

  it('rejects a style shape its parent resolver cannot interpret', () => {
    const input: LayoutTree = { nodes: [node(-1), { ...node(0), itemStyle: { align: 'middle' } }] };
    const state = createLayoutState();
    registerAnchorLayoutResolver(state);
    expect(resolveLayoutTree(new Float32Array(8), state, input, new Float32Array(4), 100, 100)).toBe(false);
    expect(explainLayoutResolution(state, input, 1)?.kind).toBe('InvalidItemStyle');
  });
});
